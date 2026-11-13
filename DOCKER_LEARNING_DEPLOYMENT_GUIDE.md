# Electricity Monitor：边学 Docker 边完成部署

这是一份把以下两份文档合并后的教程：

- `DOCKER_BEGINNER_GUIDE.md`：Docker 入门和操作顺序；
- `DOCKER_DEPLOYMENT.md`：完整配置、代理、迁移和生产部署参考。

本教程的目标不是让你机械复制命令，而是让你在迁移 Electricity Monitor 的过程中理解 Docker：

- 镜像、容器、卷、网络分别是什么；
- Compose 为什么能一次管理多个服务；
- 容器之间为什么使用 `api:8000` 和 `postgres:5432`；
- 如何先验证小步骤，再启动完整系统；
- 如何安全迁移已有 PostgreSQL，而不是直接搬数据目录；
- 如何更新、查看日志和回滚。

---

## 目录

1. [最终架构](#1-最终架构)
2. [开始前的安全原则](#2-开始前的安全原则)
3. [第一次理解 Docker](#3-第一次理解-docker)
4. [准备 Ubuntu 服务器](#4-准备-ubuntu-服务器)
5. [安装 Docker 和 Compose](#5-安装-docker-和-compose)
6. [可选：配置镜像源](#6-可选配置镜像源)
7. [先部署 Portainer](#7-先部署-portainer)
8. [准备 Electricity Monitor 的 Docker 文件](#8-准备-electricity-monitor-的-docker-文件)
8.5. [读懂 Dockerfile、Compose 和 Nginx](#85-读懂-dockerfilecompose-和-nginx)
9. [理解环境变量](#9-理解环境变量)
10. [完整 Compose 文件](#10-完整-compose-文件)
11. [第一次启动数据库](#11-第一次启动数据库)
12. [初始化或迁移数据库](#12-初始化或迁移数据库)
13. [启动 API、Worker 和前端](#13-启动-apiworker-和-前端)
14. [验证容器之间的连接](#14-验证容器之间的连接)
15. [配置宿主机 Nginx 和 HTTPS](#15-配置宿主机-nginx-和-https)
16. [按当前服务器状态迁移 systemd 到 Docker](#16-按当前服务器状态迁移-systemd-到-docker)
17. [日常 Docker 操作](#17-日常-docker-操作)
18. [更新版本](#18-更新版本)
19. [常见故障](#19-常见故障)
20. [最终检查清单](#20-最终检查清单)

---

## 1. 最终架构

最终会运行这些服务：

| 服务 | 作用 |
|---|---|
| `postgres` | PostgreSQL 数据库 |
| `migrate` | 一次性执行数据库初始化和 Alembic 迁移 |
| `api` | FastAPI API |
| `worker` | 定时查询电量、发送提醒、日报和数据清理 |
| `web` | Docker 内 Nginx，提供前端并反代 API |
| `portainer` | 可选的 Docker 图形管理后台 |

推荐的生产流量路径：

```text
浏览器
  ↓ HTTPS
宿主机 Nginx
  ↓ 127.0.0.1:8080
Docker web
  ↓ api:8000
Docker api
  ↓ postgres:5432
Docker postgres

Docker worker
  └──────────────→ postgres:5432
```

### 当前服务器基线（先读这里）

这台服务器**已经完成从 systemd 到 Docker 的全栈迁移**。当前真实运行状态：

```text
宿主机 Nginx :80
  └── 全部流量 → 127.0.0.1:8080（Docker web）

Docker Compose 项目：sdu-qingdao-electricity-monitor
  ├── postgres  Up (healthy)，只在 appnet 内暴露 5432，不映射宿主机
  ├── api       Up (healthy)，只在 appnet 内暴露 8000，不映射宿主机
  ├── worker    Up，python -m app.worker
  └── web       Up，127.0.0.1:8080 -> 容器 80

Docker 卷
  ├── sdu-qingdao-electricity-monitor_postgres_data
  ├── sdu-qingdao-electricity-monitor_uploads_data
  └── portainer_data

Docker 网络
  └── sdu-qingdao-electricity-monitor_appnet（172.30.0.0/24）

其他容器（不属于本项目，不要动）
  ├── portainer → 192.0.2.10:56789 → 容器 9443
  └── astrbot   → 独立业务容器
```

已停用的旧部署：

```text
sdu-electricity-api.service     inactive + disabled
sdu-electricity-worker.service  inactive + disabled
宿主机 PostgreSQL               仍在运行，仅作为回退数据源保留
```

已核对的服务器事实：

```text
系统：Ubuntu 20.04
Docker Engine：28.1.1
Docker Compose：v2.35.1
Docker 镜像源：https://docker.m.daocloud.io
防火墙：UFW 激活，仅放行 22、27776、80
```

迁移时留下的回退材料：

```text
数据库备份：/root/sdu_power-before-docker-*.dump
旧 Nginx 配置：/root/electricity-monitor.nginx.before-docker-*
```

宿主机站点当前只监听 80，没有 443；HTTPS 仍按后文“先 HTTP、再证书、最后 HTTPS”的顺序配置，不要假设它已经存在。

因此本教程当前的正确阅读方式是：

1. 第 1 至第 9 章用于理解 Docker 概念和文件写法；
2. 第 10 至第 14 章描述的标准启动流程，本项目已经执行完毕；
3. 第 16 章记录这次迁移实际采用的顺序，可作为下次迁移的模板；
4. 第 17 至第 19 章是日常运维、更新和排错。

当前 SSH 用户的 Docker socket 权限是 `root:docker 660`。如果普通用户执行 `docker` 出现 permission denied，重新登录 SSH，或临时使用 `sudo docker ...`；不要为了省事把 socket 权限改成 `666`。

当前仓库实际已有的 `infra/docker-compose.yml` **只启动 PostgreSQL**，而且会绑定宿主机 `127.0.0.1:5432`。它是开发用配置，不要把它误认为完整生产 Compose；生产迁移使用后文的 `compose.prod.yml`，其中 PostgreSQL 不映射宿主机端口。

以后你可以用下面几组只读命令自己复查状态：

```bash
sudo docker ps -a
sudo docker volume ls
sudo docker network ls
sudo systemctl is-active nginx docker sdu-electricity-api sdu-electricity-worker
sudo ss -lntp
```

它们分别回答：有哪些容器、有哪些永久卷、有哪些 Docker 网络、哪些服务在运行、哪些端口正在监听。

---


注意：

- 宿主机 Nginx 负责公网 HTTPS；
- Docker 内的 `web` 负责静态前端和 API 反向代理；
- API 不发布到宿主机；
- PostgreSQL 不发布到宿主机；
- Worker 不需要 HTTP 端口；
- Portainer 后面也只监听管理网卡或本机，不应随意暴露公网。

### 容器里的 `127.0.0.1` 是谁？

这是第一次使用 Docker 最容易混淆的地方。

在 `api` 容器内：

```text
127.0.0.1 = api 容器自己
postgres   = PostgreSQL 容器
```

在 `web` 容器内：

```text
127.0.0.1 = web 容器自己
api        = FastAPI 容器
```

所以配置必须是：

```text
Nginx      → http://api:8000
DATABASE_URL → @postgres:5432
```

而不是：

```text
Nginx      → http://127.0.0.1:8000
DATABASE_URL → @127.0.0.1:5432
```

---

## 2. 开始前的安全原则

### 2.1 不要把密码提交到 Git

以下文件只能留在服务器：

```text
.env.docker
backend/.env.docker
```

不要把真实 SMTP 密码、数据库密码、密钥、管理员密码写进 Dockerfile、Compose 文件或 Git。

### 2.2 Portainer 是高权限工具

Portainer 需要挂载：

```text
/var/run/docker.sock
```

这意味着 Portainer 基本拥有本机 Docker 的 root 级管理能力。建议：

- 只绑定内网管理地址或 `127.0.0.1`；
- 使用 HTTPS；
- 管理员使用独立强密码；
- 不公开开放 8000/9000；
- 不把 Docker socket 暴露给普通业务容器。

### 2.3 不要随便删除卷

以下命令会删除 Compose 卷中的数据库和上传文件：

```bash
docker compose down -v
```

生产环境不要随便执行。

### 2.4 迁移数据库只用备份恢复

不要把旧 PostgreSQL 的数据目录直接挂载到新 PostgreSQL 镜像。

正确流程是：

```text
旧 PostgreSQL
    ↓ pg_dump -Fc
新 PostgreSQL 容器
    ↓ pg_restore
init_db / Alembic upgrade
    ↓
启动 API 和 Worker
```

---

## 3. 第一次理解 Docker

### 3.1 Image：镜像

镜像是可以运行的模板，例如：

```text
python:3.13-slim
postgres:16-alpine
nginx:1.27-alpine
portainer/portainer-ce:latest
```

第一次运行时 Docker 会下载镜像。

### 3.2 Container：容器

容器是镜像运行起来后的实例。

```bash
docker ps
```

查看运行中的容器；

```bash
docker ps -a
```

查看包括已经停止的容器。

容器可以删除和重建。真正重要的数据应该放在卷里，不要只存在容器可写层中。

### 3.3 Volume：卷

卷用来保存容器重建后仍需保留的数据：

```text
postgres_data  ← PostgreSQL 数据
uploads_data   ← 管理员上传文件
portainer_data ← Portainer 配置
```

查看卷：

```bash
docker volume ls
```

### 3.4 Network：网络

Compose 会给服务放进同一张 Docker 网络。服务名会自动解析成容器 IP：

```text
api       → postgres:5432
web       → api:8000
worker    → postgres:5432
```

### 3.5 Compose

Compose 用一个 YAML 文件描述多个容器：

```bash
docker compose -f compose.prod.yml up -d
```

常用参数：

| 参数 | 含义 |
|---|---|
| `-f compose.prod.yml` | 指定 Compose 文件 |
| `up` | 创建并启动服务 |
| `-d` | 后台运行 |
| `ps` | 查看状态 |
| `logs` | 查看日志 |
| `exec` | 在正在运行的容器中执行命令 |
| `run --rm` | 临时运行一个命令，完成后删除临时容器 |
| `stop` | 停止容器但保留容器和卷 |
| `down` | 删除 Compose 创建的容器和网络，默认保留卷 |

### 3.6 先运行一个最小实验

Docker 安装好以后，先运行官方测试容器：

```bash
sudo docker run --rm hello-world
```

你会看到 Docker 完成：

```text
下载镜像 → 创建容器 → 执行程序 → 输出结果 → 删除容器
```

这一步不会留下业务数据。

---

## 4. 准备 Ubuntu 服务器

本教程的安装命令针对 Ubuntu 22.04/24.04；当前服务器如果是 Ubuntu 20.04，也应优先使用 Docker 官方仓库，并注意 Ubuntu 20.04 已进入较老的维护阶段。

确认系统：

```bash
cat /etc/os-release
```

检查端口：

```bash
sudo ss -lntp
```

本教程默认使用：

```text
宿主机 Nginx：80 / 443
Docker web：127.0.0.1:8080
Portainer：管理地址:56789 或 127.0.0.1:9443
```

将代码放到服务器：

```bash
sudo mkdir -p /opt/sdu-qingdao-electricity-monitor
sudo chown -R "$USER:$USER" /opt/sdu-qingdao-electricity-monitor

git clone <你的仓库地址> /opt/sdu-qingdao-electricity-monitor
cd /opt/sdu-qingdao-electricity-monitor
```

如果代码已经存在：

```bash
cd /opt/sdu-qingdao-electricity-monitor
git pull
```

---

## 5. 安装 Docker 和 Compose

本教程统一使用 Docker 官方 APT 仓库，不混用 Ubuntu 的 `docker.io` 和 Docker 官方的 Compose 插件。

先安装基础工具与宿主机 Nginx：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx
```

添加 Docker 官方仓库：

```bash
sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  ${VERSION_CODENAME} stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

安装 Docker Engine、Buildx 和 Compose V2：

```bash
sudo apt update
sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

启用服务：

```bash
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
```

允许当前用户使用 Docker：

```bash
sudo usermod -aG docker "$USER"
```

退出 SSH，再重新登录一次。

验证：

```bash
docker version
docker compose version
```

如果 `docker-ce` 找不到：

```bash
cat /etc/os-release
```

确认系统是 Ubuntu，并确认 Docker 官方仓库中的 codename 与系统一致。不要在这条安装路径中混入：

```text
docker.io
docker-compose-v2
```

---

## 6. 可选：配置镜像源

如果执行：

```bash
docker pull portainer/portainer-ce:latest
```

出现：

```text
registry-1.docker.io ... Client.Timeout
```

说明服务器访问 Docker Hub 不稳定或被限制。先诊断：

```bash
getent hosts registry-1.docker.io
curl -Iv --connect-timeout 10 --max-time 20 \
  https://registry-1.docker.io/v2/
```

只有确认 Docker Hub 不可达时，才配置可信的镜像源。下面是一个示例地址；它是第三方服务，使用前应确认你接受其服务条款和可用性：

```bash
sudo install -d -m 0755 /etc/docker

printf '%s\n' \
  '{"registry-mirrors":["https://docker.m.daocloud.io"]}' | \
  sudo tee /etc/docker/daemon.json > /dev/null

sudo systemctl restart docker
```

验证：

```bash
docker info --format '{{json .RegistryConfig.Mirrors}}'
```

如果镜像源不可用，删除或更换 `/etc/docker/daemon.json` 后重启 Docker。不要把未经确认的镜像源永久写进生产配置。

---

## 7. 先部署 Portainer

Portainer 适合作为第一个 Docker 实验：你可以在网页上观察容器、镜像、网络和卷。

### 7.1 推荐的安全绑定

如果只在服务器本机访问：

```bash
sudo docker volume create portainer_data

sudo docker run -d \
  --name portainer \
  --restart=unless-stopped \
  -p 127.0.0.1:9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

本地电脑通过 SSH 隧道访问：

```bash
ssh -N -L 9443:127.0.0.1:9443 用户名@服务器IP
```

然后浏览器打开：

```text
https://127.0.0.1:9443
```

### 7.2 绑定到内网管理地址

如果你的服务器内网地址是 `192.0.2.10`，希望使用端口 `56789`：

```bash
sudo docker stop portainer 2>/dev/null || true
sudo docker rm portainer 2>/dev/null || true

sudo docker run -d \
  --name portainer \
  --restart=unless-stopped \
  -p 192.0.2.10:56789:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

访问：

```text
https://192.0.2.10:56789
```

这里不会开放：

```text
8000
9000
```

容器内部可能监听这两个端口，但没有发布到宿主机。

这台服务器当前已经按上面的方式运行 Portainer：`192.0.2.10:56789 -> 9443`，数据卷为 `portainer_data`。当前 Docker socket 权限是 `root:docker 660`，如果你刚加入 `docker` 用户组但当前 SSH 会话还没刷新，先使用 `sudo docker ...`，重新登录后再省略 `sudo`。

服务器上还有一个名为 `astrbot` 的独立 Docker 容器。学习本项目时不要对它执行 `docker rm`、`docker compose down` 或删除它使用的卷。

### 7.3 初始化 token

首次初始化时，Portainer 可能在日志中显示一次性 setup token：

```bash
sudo docker logs portainer
```

只在服务器终端读取和使用，不要把 token 发到聊天或提交到文件。

如果 token 曾经泄露、且尚未完成首次初始化，可以重置 Portainer 自身配置：

```bash
sudo docker stop portainer
sudo docker rm portainer
sudo docker volume rm portainer_data
sudo docker volume create portainer_data
```

然后重新执行启动命令。这个操作只删除 Portainer 的账号和配置，不删除 Electricity Monitor 的数据库卷。

### 7.4 查看 Docker 对象

```bash
docker ps
docker images
docker volume ls
docker network ls
```

这四条命令分别查看：容器、镜像、卷、网络。

---

## 8. 准备 Electricity Monitor 的 Docker 文件

建议准备：

```text
compose.prod.yml
.dockerignore
.env.docker
backend/.env.docker
deploy/backend.Dockerfile
deploy/frontend.Dockerfile
deploy/nginx.conf
```

创建目录：

```bash
mkdir -p deploy
```

### 8.1 `deploy/backend.Dockerfile`

```dockerfile
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/ /app/

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=172.30.0.0/24", "--no-server-header"]
```

### 8.2 `deploy/frontend.Dockerfile`

同源部署时不设置 `VITE_API_BASE_URL`，让前端回退到 `window.location.origin`。

```dockerfile
FROM node:22-alpine AS build

WORKDIR /src

RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ /src/
RUN pnpm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
```

不要设置：

```env
VITE_API_BASE_URL=/
```

这可能造成 `//api/...`。同源部署时不提供该变量；如果要明确指定，写完整 URL，例如：

```env
VITE_API_BASE_URL=https://electricity.example.com
```

### 8.3 `.dockerignore`

```text
.git
.gitignore

.env
.env.*
!.env.example

backend/.env
backend/.env.*
!backend/.env.example

backend/dev.sqlite3
backend/*.sqlite3
backend/uploads
frontend/.env
frontend/node_modules
frontend/dist

**/__pycache__
**/*.pyc
**/.pytest_cache
**/.ruff_cache

*.zip
*.tar
*.log
```

### 8.4 Docker 内 Nginx

本配置默认前面还有宿主机 Nginx。

宿主机 Nginx 会覆盖 `X-Real-IP`，Docker 内 Nginx 再使用该值设置 `X-Forwarded-For`。

`deploy/nginx.conf`：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    server_tokens off;
    client_max_body_size 22m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;

    location ~ /\.(?!well-known) {
        deny all;
    }

    location ~* \.(?:bak|conf|db|env|ini|log|sqlite3?|sql|tar|ya?ml|zip)$ {
        deny all;
    }

    location /api/ {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $http_x_real_ip;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
    }

    location = /health {
        proxy_pass http://api:8000/health;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $http_x_real_ip;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://api:8000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $http_x_real_ip;
        proxy_set_header X-Forwarded-Proto $scheme;

        expires 7d;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果你不使用外层宿主机 Nginx，而是直接将 Docker `web` 暴露给客户端，则把上面三处：

```nginx
proxy_set_header X-Forwarded-For $http_x_real_ip;
```

改为：

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

不要在没有可信外层代理时使用 `$http_x_real_ip`。

### 8.5 读懂 Dockerfile、Compose 和 Nginx

这几个文件分别解决不同问题：

```text
Dockerfile       → 如何制作一个镜像
compose.prod.yml → 如何运行多个容器并把它们连起来
nginx.conf       → web 容器收到请求后转发给谁
.env.docker      → Compose 的变量
backend/.env.docker → API 容器运行时的配置
```

#### 后端 Dockerfile 为什么这样写

```dockerfile
FROM python:3.13-slim
```

从一个已经有 Python 的基础镜像开始。镜像不是虚拟机，而是文件系统和启动命令的模板。

```dockerfile
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
```

先复制依赖文件，再安装依赖。这样源代码变化时，Docker 可以复用依赖安装这一层，构建更快。

```dockerfile
COPY backend/ /app/
```

把后端代码复制进镜像。`.dockerignore` 必须排除 `.env` 和数据库文件，避免把密钥打进镜像。

```dockerfile
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app
USER app
```

创建普通用户运行 API，避免应用进程以 root 身份运行。

```dockerfile
EXPOSE 8000
```

`EXPOSE` 只是镜像说明，不会把端口发布到宿主机。真正的端口发布由 Compose 的 `ports` 决定。

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

定义容器默认启动命令；Compose 可以用 `command` 覆盖它。

#### 前端 Dockerfile 为什么有两个 FROM

前端使用多阶段构建：

```text
node 阶段：安装 pnpm，执行 vite build
nginx 阶段：只保留 dist 静态文件
```

生产运行容器不需要 Node、pnpm 和源代码，因此镜像更小。

#### Compose 中最重要的字段

```yaml
build:
  context: .
  dockerfile: deploy/backend.Dockerfile
```

`context: .` 是项目根目录，所以 Dockerfile 才能执行 `COPY backend/...`。

```yaml
env_file:
  - backend/.env.docker
```

把运行时环境变量传给容器，不会把变量写进镜像层。

```yaml
ports:
  - "127.0.0.1:8080:80"
```

把宿主机端口映射到容器端口，格式是：

```text
宿主机地址:宿主机端口:容器端口
```

```yaml
expose:
  - "8000"
```

只声明给 Docker 网络中的其他容器使用，不发布到宿主机。API 使用 `expose`，web 使用 `ports`。

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

把命名卷挂到容器路径，容器重建时数据仍保留。

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

要求 PostgreSQL 健康后再启动 API；它不能替代迁移，所以仍要单独运行 `migrate`。

#### Nginx 为什么使用 `api:8000`

```nginx
location /api/ {
    proxy_pass http://api:8000;
}
```

`api` 是 Compose 服务名，Docker 内置 DNS 会解析到 API 容器。这里不能用 `127.0.0.1:8000`，因为那会指向 web 容器自己。

---


## 9. 理解环境变量

### 9.1 根目录 `.env.docker`

Compose 用它进行变量替换：

```env
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_PASSWORD
```

生成密码：

```bash
openssl rand -hex 24
```

不要把占位符原样用于生产。

### 9.2 `backend/.env.docker`

```env
APP_NAME=Electricity Monitor
APP_DEBUG=false
ALLOW_INSECURE_STARTUP=false

SECRET_KEY=一条随机长字符串
CREDENTIAL_ENCRYPTION_KEY=另一条随机长字符串
CREDENTIAL_ENCRYPTION_OLD_KEYS=

ACCESS_TOKEN_EXPIRE_MINUTES=10080

DATABASE_URL=postgresql+psycopg://sdu_power:同一条数据库密码@postgres:5432/sdu_power

CORS_ORIGINS=https://your-domain.example
TRUSTED_HOSTS=your-domain.example
TRUSTED_PROXY_CIDRS=172.30.0.0/24

SECURITY_HEADERS_ENABLED=true
UPLOAD_DIR=/app/uploads
APPEARANCE_UPLOAD_MAX_BYTES=5242880
MAX_REQUEST_BODY_BYTES=1048576

SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USERNAME=你的邮箱
SMTP_PASSWORD=邮箱授权码
SMTP_FROM_EMAIL=你的邮箱
SMTP_USE_SSL=true
SMTP_USE_STARTTLS=false

CHECK_INTERVAL_SECONDS=14400
CHECK_BATCH_SIZE=50
CHECK_REQUEST_DELAY_SECONDS=0.5
NOTIFY_INTERVAL_SECONDS=3600
NOTIFY_COOLDOWN_HOURS=12

HWGL_API_BASE_URL=http://www.hwgl.qd.sdu.edu.cn/lwwaterpower
HWGL_API_TIMEOUT=10
```

两个文件中的数据库密码必须对应：

```env
# .env.docker
POSTGRES_PASSWORD=同一条密码
```

```env
# backend/.env.docker
DATABASE_URL=postgresql+psycopg://sdu_power:同一条密码@postgres:5432/sdu_power
```

数据库主机必须是：

```text
postgres
```

不是：

```text
127.0.0.1
```

保护文件：

```bash
chmod 600 .env.docker backend/.env.docker
```

---

## 10. 完整 Compose 文件

创建 `compose.prod.yml`：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: sdu_power
      POSTGRES_USER: sdu_power
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      appnet:
        aliases:
          - postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sdu_power -d sdu_power"]
      interval: 10s
      timeout: 5s
      retries: 10

  migrate:
    build:
      context: .
      dockerfile: deploy/backend.Dockerfile
    env_file:
      - backend/.env.docker
    command: ["python", "-m", "app.scripts.init_db"]
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - appnet
    restart: "no"

  api:
    build:
      context: .
      dockerfile: deploy/backend.Dockerfile
    env_file:
      - backend/.env.docker
    command:
      [
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
        "--proxy-headers",
        "--forwarded-allow-ips=172.30.0.0/24",
        "--no-server-header"
      ]
    volumes:
      - uploads_data:/app/uploads
    expose:
      - "8000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - appnet
    healthcheck:
      test:
        [
          "CMD",
          "python",
          "-c",
          "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
        ]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: deploy/backend.Dockerfile
    env_file:
      - backend/.env.docker
    environment:
      # Worker 的 datetime.now() 用于业务调度；固定为北京时间，避免镜像默认 UTC。
      TZ: Asia/Shanghai
    command: ["python", "-m", "app.worker"]
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - appnet
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: deploy/frontend.Dockerfile
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - appnet
    restart: unless-stopped

networks:
  appnet:
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/24

volumes:
  postgres_data:
  uploads_data:
```

固定网络的作用：

```env
TRUSTED_PROXY_CIDRS=172.30.0.0/24
```

这样 API 只信任 Docker 内部代理网段，不会信任任意转发头。

---

## 11. 第一次启动数据库

先检查 Compose 文件是否能正确展开：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  config
```

如果这里报环境变量或 YAML 错误，不要继续启动。

启动 PostgreSQL：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d postgres
```

查看状态：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

等待：

```text
postgres   running (healthy)
```

查看数据库日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs postgres
```

---

## 12. 初始化或迁移数据库

数据库健康后执行：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

这会：

1. 使用后端镜像创建临时容器；
2. 执行 `python -m app.scripts.init_db`；
3. 初始化新数据库或执行 Alembic 升级；
4. 删除临时迁移容器；
5. 保留 PostgreSQL 卷。

不要用手工 SQL 代替项目迁移脚本。

---

## 13. 启动 API、Worker 和前端

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

查看状态：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

查看日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs --tail=100 api worker web
```

持续观察 Worker：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f worker
```

按 `Ctrl+C` 只停止查看日志，不会停止 Worker。

创建管理员：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -m app.scripts.create_admin admin
```

---

## 14. 验证容器之间的连接

### 14.1 检查 Docker web

```bash
curl --fail http://127.0.0.1:8080/health
```

这验证：

```text
宿主机 → web → api → health
```

### 14.2 检查前端

```bash
curl --fail -I http://127.0.0.1:8080/
```

### 14.3 检查 API 路由

```bash
curl -i http://127.0.0.1:8080/api/announcements
```

同源前端请求必须是：

```text
/api/...
```

不能是：

```text
//api/...
```

### 14.4 检查 API 能解析数据库服务名

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -c "import socket; print(socket.gethostbyname('postgres'))"
```

### 14.5 检查迁移脚本

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -m app.scripts.init_db
```

---

## 15. 配置宿主机 Nginx 和 HTTPS

这一步分为：

```text
本机 Docker 验证
    ↓
宿主机 HTTP 反代
    ↓
HTTP 域名验证
    ↓
申请 HTTPS 证书
    ↓
启用 HTTPS
```

不要在证书文件不存在时直接加载带有 `ssl_certificate` 的配置。

### 15.1 先验证本机

确保：

```bash
curl --fail http://127.0.0.1:8080/health
```

成功后再配置域名。

### 15.2 配置 HTTP 反代

域名的 A/AAAA 记录必须指向服务器，80 端口必须可达。

创建：

```bash
sudo nano /etc/nginx/sites-available/electricity-monitor
```

先使用只有 HTTP 的配置：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并检查：

```bash
sudo ln -sf /etc/nginx/sites-available/electricity-monitor \
  /etc/nginx/sites-enabled/electricity-monitor

sudo nginx -t
sudo systemctl reload nginx
```

测试 HTTP：

```bash
curl --fail http://your-domain.example/health
```

如果失败，先解决 DNS、防火墙、Nginx 或 Docker web 问题，不要继续申请证书。

### 15.3 申请证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Certbot 会验证域名、申请证书并修改 Nginx 配置。证书通常位于：

```text
/etc/letsencrypt/live/your-domain.example/fullchain.pem
/etc/letsencrypt/live/your-domain.example/privkey.pem
```

### 15.4 启用 HTTPS

证书生成后，确认 Nginx 配置包含：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.example;

    ssl_certificate /etc/letsencrypt/live/your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

外层宿主机 Nginx 使用 `$remote_addr` 覆盖客户端地址。不要直接透传或追加客户端自带的转发链。

检查并加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://your-domain.example/health
```

---

## 16. 按当前服务器状态迁移 systemd 到 Docker

当前服务器仍由 systemd 运行 API 和 Worker，宿主机 Nginx 也仍直接读取 `frontend/dist`。因此不要一开始就停服务；先准备镜像和 Docker PostgreSQL，再做一次有备份的切换。

### 16.1 先构建但不启动 Docker Worker

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  build api web worker
```

先只启动新的 PostgreSQL：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d postgres
```

当前旧 Worker 还在运行时，**不要启动 Docker Worker**，否则两个 Worker 会同时检查宿舍、发送提醒和日报。

### 16.2 进入切换窗口并备份旧数据库

先停止旧 API 和 Worker，冻结旧数据库写入：

```bash
sudo systemctl stop sdu-electricity-worker sdu-electricity-api
```

马上备份宿主机 PostgreSQL：

```bash
sudo -u postgres pg_dump -Fc sdu_power \
  > "$HOME/sdu_power-before-docker-$(date +%F-%H%M%S).dump"
```

### 16.3 恢复到 Docker PostgreSQL

根目录 `.env.docker` 的 `POSTGRES_PASSWORD` 必须和 `backend/.env.docker` 的 `DATABASE_URL` 密码一致。

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec -T postgres \
  sh -c '
    PGPASSWORD="$POSTGRES_PASSWORD" \
    pg_restore \
      -h 127.0.0.1 \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      --no-owner \
      --clean \
      --if-exists \
      --exit-on-error
  ' < "$HOME/sdu_power-before-docker-日期.dump"
```

这里的 `-h 127.0.0.1` 是在 PostgreSQL 容器内部使用，指向 PostgreSQL 容器自己；这和 API 配置中的 `@postgres:5432` 不矛盾。

运行迁移：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

### 16.4 先启动 API 和 web，暂时不启动 Worker

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api web
```

本机测试 Docker web：

```bash
curl --fail http://127.0.0.1:8080/health
curl --fail -I http://127.0.0.1:8080/
```

此时宿主机 Nginx 仍然服务旧的 `frontend/dist`，所以外部用户还不会看到 Docker web；先用服务器本机 curl 验证新链路。

### 16.5 切换宿主机 Nginx

确认 Docker web 和 API 正常后，把宿主机 Nginx 的应用流量切换为：

```nginx
proxy_pass http://127.0.0.1:8080;
```

切换前备份配置：

```bash
sudo cp /etc/nginx/sites-enabled/electricity-monitor \
  "$HOME/electricity-monitor.nginx.before-docker"
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --fail http://192.0.2.10/health
```

### 16.6 最后启动 Docker Worker，关闭旧 systemd 服务

确认网页和 API 已经切换成功后：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d worker
```

再关闭旧服务的开机启动：

```bash
sudo systemctl disable sdu-electricity-api sdu-electricity-worker
sudo systemctl stop sdu-electricity-api sdu-electricity-worker
```

确认最终运行方式：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps

sudo systemctl is-active sdu-electricity-api sdu-electricity-worker
```

### 16.7 旧上传文件

数据库备份不包含旧的 `backend/uploads`。迁移前查看卷：

```bash
docker volume ls
```

把旧上传文件复制到 `uploads_data` 卷。不要删除 `postgres_data` 或 `uploads_data`。

### 16.8 回退思路

如果 Docker API/web 在切换后验证失败：

1. 停止 Docker Worker，避免重复任务；
2. 将宿主机 Nginx 恢复为切换前配置；
3. 启动旧 systemd API/Worker；
4. 保留 Docker 日志和数据库备份，先定位错误。

数据库已经在 Docker 中产生新写入后，不能把旧 PostgreSQL 当成自动同步的回滚目标；回退前必须明确数据一致性方案。

### 16.9 本次迁移的实际执行记录

下面内容是已经在这台服务器上执行过的事实，可作为下一次同类迁移的参照：

```text
1. 读取 backend/.env，复用其中已有的数据库密码、SECRET_KEY、
   CREDENTIAL_ENCRYPTION_KEY 和 SMTP 配置，生成：
     .env.docker                （只含 POSTGRES_PASSWORD）
     backend/.env.docker        （DATABASE_URL 主机改为 postgres，
                                 UPLOAD_DIR 改为 /app/uploads，
                                 TRUSTED_PROXY_CIDRS 改为 172.30.0.0/24）
   两个文件权限均为 600，属主 root。

2. docker compose build api worker web
   → 三个镜像构建成功。

3. docker compose up -d postgres
   → 新 PostgreSQL 启动并通过健康检查。

4. systemctl stop sdu-electricity-worker sdu-electricity-api
   → 旧服务停止，进入切换窗口。

5. pg_dump -Fc sdu_power
   → /root/sdu_power-before-docker-2026-09-18-232956.dump（约 162 KB，权限 600）

6. pg_restore --no-owner --clean --if-exists --exit-on-error
   → 数据恢复到 Docker PostgreSQL。

7. docker compose run --rm migrate
   → database ready (revision 20260907_0007)

8. docker compose up -d api web
   → api healthy，web 映射 127.0.0.1:8080

9. 复制旧 backend/uploads 的 12 个文件到 uploads_data 卷，并修正属主为 app。

10. 备份旧 Nginx 配置后切换到代理 127.0.0.1:8080：
    /root/electricity-monitor.nginx.before-docker-2026-09-18-233112

11. docker compose up -d worker
    → Worker 启动并补执行当天遗漏的调度槽。

12. systemctl disable sdu-electricity-api sdu-electricity-worker
    → 旧服务不再开机自启。
```

迁移后核对结果：

```text
users=25   rooms=67   user_rooms=27   announcements=1
uploads 文件数=12
宿主机 /health 返回 200
公开 /api/announcements 返回 200
```

宿主机 PostgreSQL 目前仍在运行，作为短期回退数据源保留。确认新部署稳定后，可以再决定何时停用它；停用前先确认不再需要回退。

---
## 17. 日常 Docker 操作

### 查看状态

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

### 查看日志

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs --tail=100 api worker web
```

### 只看 API

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f api
```

### 重启一个服务

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  restart api
```

### 停止服务但保留卷

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  stop
```

### 查看卷

```bash
docker volume ls
```

### 查看网络

```bash
docker network ls
```

### 进入容器执行命令

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api sh
```

退出容器：

```bash
exit
```

---

## 18. 更新版本

进入项目：

```bash
cd /opt/sdu-qingdao-electricity-monitor
git pull
```

先构建新镜像：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  build --pull api worker web
```

备份数据库：

```bash
sudo -u postgres pg_dump -Fc sdu_power \
  > "$HOME/sdu_power-before-update-$(date +%F-%H%M%S).dump"
```

停止 API 和 Worker，执行迁移：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  stop api worker

docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

重新启动：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

验证：

```bash
curl --fail https://your-domain.example/health

docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

如果构建失败，不要停止正在运行的旧容器；先修复构建问题。

---

## 19. 常见故障

### API 连不上数据库

错误：

```env
DATABASE_URL=postgresql+psycopg://...@127.0.0.1:5432/sdu_power
```

正确：

```env
DATABASE_URL=postgresql+psycopg://...@postgres:5432/sdu_power
```

### Nginx 502

Docker 内 Nginx 正确：

```nginx
proxy_pass http://api:8000;
```

错误：

```nginx
proxy_pass http://127.0.0.1:8000;
```

查看：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs web api
```

### 前端 API 变成 `//api/...`

不要设置：

```env
VITE_API_BASE_URL=/
```

同源部署时删除该变量并重新构建：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  build web

docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d web
```

### 所有用户 IP 都变成代理地址

检查：

```env
TRUSTED_PROXY_CIDRS=172.30.0.0/24
```

宿主机 Nginx：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

Docker web：

```nginx
proxy_set_header X-Forwarded-For $http_x_real_ip;
```

如果没有外层宿主机 Nginx，Docker web 应改用：

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

### Docker Hub 拉取超时

检查：

```bash
getent hosts registry-1.docker.io
curl -Iv --connect-timeout 10 --max-time 20 \
  https://registry-1.docker.io/v2/
```

再检查镜像源：

```bash
docker info --format '{{json .RegistryConfig.Mirrors}}'
```

### Worker 没有运行

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps worker

docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f worker
```

必须同时有：

```text
postgres + api + worker + web
```

---

## 20. 最终检查清单

### Docker 基础

- [ ] 能运行 `docker version`
- [ ] 能运行 `docker compose version`
- [ ] 已理解 image/container/volume/network 的区别
- [ ] `hello-world` 实验成功
- [ ] 未混用 `docker.io` 和 Docker 官方 Compose 插件

### Portainer

- [ ] `portainer` 容器状态为 Up
- [ ] `portainer_data` 已创建
- [ ] 只绑定管理地址或 `127.0.0.1`
- [ ] 没有暴露 8000/9000
- [ ] 已完成首次管理员初始化
- [ ] 没有把 setup token 发到聊天或提交到 Git

### Electricity Monitor

- [ ] `DATABASE_URL` 使用 `postgres:5432`
- [ ] 同源构建没有设置 `VITE_API_BASE_URL=/`
- [ ] Compose 网络是 `172.30.0.0/24`
- [ ] `TRUSTED_PROXY_CIDRS=172.30.0.0/24`
- [ ] Uvicorn 的代理信任限制为 `172.30.0.0/24`
- [ ] API、Worker、Web、PostgreSQL 状态正常
- [ ] `/health` 返回成功
- [ ] 浏览器请求路径为 `/api/...`
- [ ] 已创建管理员
- [ ] Worker 日志能看到正常调度

### HTTPS 和迁移

- [ ] 已先验证 `http://127.0.0.1:8080/health`
- [ ] 已先配置 HTTP 反代并验证域名
- [ ] 证书存在后才加载 HTTPS 配置
- [ ] 正式环境已启用 HTTPS
- [ ] 已备份旧 PostgreSQL
- [ ] 使用了 `pg_dump -Fc` / `pg_restore`
- [ ] 没有直接挂载旧 PostgreSQL 数据目录
- [ ] 已确认上传文件也完成迁移
- [ ] 没有执行 `docker compose down -v`
