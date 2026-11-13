# Electricity Monitor Docker 入门教程

> **如果你要的是"从零开始学到能面试"，先看 [`SRE_LEARNING_PATH.md`](SRE_LEARNING_PATH.md)。**
> 那份文档负责"先学什么、学到什么程度、面试考什么"；这份文档负责"第一次上手时，每个名词和每条命令是什么意思"。

## 四份文档怎么分工

| 文档 | 回答什么问题 | 什么时候看 |
|---|---|---|
| [`SRE_LEARNING_PATH.md`](SRE_LEARNING_PATH.md) | 学习路线、阶段目标、面试考点 | 每次开始学之前 |
| **本文档** | 零基础名词解释 + 第一次部署的每一步 | 第一次接触 Docker / Linux 时 |
| [`DOCKER_LEARNING_DEPLOYMENT_GUIDE.md`](DOCKER_LEARNING_DEPLOYMENT_GUIDE.md) | 完整的部署与迁移操作教程（内容最全） | 真正做迁移、要照抄命令时 |
| [`DOCKER_DEPLOYMENT.md`](DOCKER_DEPLOYMENT.md) | 配置参考手册 | 需要查某个配置项时 |

本文档与合并版内容重合，**不要两份一起读**：零基础就按本文档顺序走一遍，遇到合并版更详细的章节再跳过去。

这是一份给**真正零基础**的教程：会一点点编程、第一次用 Linux 服务器、第一次听说 Docker，也能跟着走完。

目标不是让你背 Docker 命令，而是让你知道：

1. 每个文件是干什么的；
2. 每条命令会产生什么结果；
3. 出错时应该看哪里；
4. 怎样安全地改动一个正在对外服务的系统。

> 说到"安全地"，这份文档里所有**会动线上服务**的操作，都必须先做备份、先验证、能回滚。这不是洁癖，这就是 SRE 的工作方式。

---

## 零基础起步：先搞懂这 10 个词

不要急着敲命令。先把下面这张表过一遍，后面每一章都会用到这些词。

| # | 名词 | 一句话解释 | 在你项目里的样子 |
|---|---|---|---|
| 1 | 服务器 / 宿主机 | 一台一直开机、放在机房里、你用网络连过去的电脑 | `192.0.2.10` 这台 Ubuntu |
| 2 | 终端 / Shell / 命令 | 你用打字的方式指挥电脑；Shell 是翻译官 | Windows 上的 PowerShell、服务器上的 bash |
| 3 | 进程 / 端口 | 进程 = 正在运行的程序；端口 = 它占用的"门牌号" | api 进程占用容器内的 `8000` |
| 4 | 服务 / systemd | 让程序开机自启、崩溃重启的管家 | 宿主机上的 `nginx` |
| 5 | 环境变量 | 不写死在代码里、由运行环境传进去的配置 | `DATABASE_URL`、`POSTGRES_PASSWORD` |
| 6 | 端口映射 | 把宿主机的某个端口，接到容器里的某个端口 | `127.0.0.1:8080:80` |
| 7 | 镜像 / 容器 / 卷 / 网络 | Docker 的四件套（详见第 1 章） | 5 个服务、`postgres_data`、`appnet` |
| 8 | 反向代理 | 站在最前面接客、再把请求转给后面服务的"前台" | 宿主机 Nginx → Docker web |
| 9 | 数据库 / 迁移 | 存数据的地方；迁移 = 用脚本改表结构 | PostgreSQL 16 + Alembic |
| 10 | 日志 | 程序自己写的"我干了什么"的记录 | `docker compose logs api` |

### 一条命令该怎么读

以这句为例：

```bash
docker compose -f compose.prod.yml logs --tail=50 -f api
```

拆开看，永远是这个结构：**谁 → 做什么 → 在哪里做 → 怎么做**

| 片段 | 含义 |
|---|---|
| `docker compose` | 谁：Docker 的 Compose 工具 |
| `logs` | 做什么：看日志 |
| `-f compose.prod.yml` | 在哪里做：用这份编排文件描述的项目 |
| `--tail=50 -f api` | 怎么做：最后 50 行、持续跟随、只看 api 服务 |

**练习**：用同样的方法，把 `docker run -d --name test -p 8081:80 nginx:alpine` 拆成四段。
（提示：`-d` 是后台运行，`--name` 是起名字，`-p` 是端口映射。）

### 从 Windows 连到服务器

你本机是 Windows，服务器是 Linux。连接命令是：

```powershell
ssh username@192.0.2.10
```

第一次连接会问 `Are you sure you want to continue connecting?`，输入 `yes`。
之后输入密码时**屏幕上不会显示任何字符**（不是卡住了，这是正常的安全设计）。

传文件用 `scp`（或者用图形化工具如 WinSCP / MobaXterm）：

```powershell
scp .\compose.prod.yml username@192.0.2.10:/tmp/
```

连上之后你就在服务器上了，**你敲的每条命令都是在服务器上执行的**。这一点必须时刻记得：
在服务器上执行 `rm -rf` 是真的会删掉东西的。

### 看不懂的时候怎么办（三步法）

这是全篇最重要的方法，比任何命令都重要：

1. **先读原文报错**。不要只看最后一行，往前翻 5–10 行，通常答案在那里。
2. **查这个词**。`man 命令名`（按 `q` 退出）、`命令 --help`、官方文档。
3. **做最小实验**。不要在生产上试，先起一个一次性的容器/测试文件验证你的猜想。

```bash
docker run --rm -it alpine sh   # 一个用完就消失的小实验场
```

三步走完还是不懂 → 把它写成一句具体的问句（"为什么 `docker compose logs api` 显示容器不存在，但 `docker ps` 能看到它？"）。**能问出好问题，本身就是能力。**

---

## 这份文档里的知识，会考什么面试题

学的时候顺手对照，你就知道哪些内容值得多花时间。

| 章节 | 对应面试题（节选） |
|---|---|
| 第 1 章 镜像/容器/卷/网络 | 容器和虚拟机的区别？Volume 和 bind mount 的区别？容器间怎么通信？ |
| 第 2 章 代理模式 | 什么是反向代理？`X-Real-IP` / `X-Forwarded-For` 是干什么的？为什么要双层 Nginx？ |
| 第 4–5 章 安装与部署 | 一台新服务器交付上线，你会做哪些初始化？ |
| 第 6 章 环境变量 | 配置和代码为什么要分离？密钥怎么管理？ |
| 第 7–9 章 启动顺序与健康检查 | 什么是启动竞态？healthcheck 怎么写才有用？ |
| 第 12 章 HTTPS | HTTPS 握手过程？证书过期会怎样？怎么自动续期？ |
| 第 13 章 迁移 | 数据库迁移为什么不能直接拷数据目录？怎么保证迁移可回滚？ |
| 第 15 章 更新代码 | 你们的发布流程是什么？出问题怎么回滚？回滚要多久？ |
| 第 16 章 常见错误 | 502 / 504 分别代表什么？怎么一步步定位？ |
| 全篇 | "你做过什么运维相关的项目？遇到过什么故障？怎么解决的？" |

---

## 0. 你最后会得到什么

部署完成后，服务器上会运行四类实际服务：

```text
浏览器
  ↓ HTTPS
宿主机 Nginx
  ↓ 127.0.0.1:8080
Docker 里的 web（Nginx + React 前端）
  ↓ Docker 内部网络 api:8000
Docker 里的 api（FastAPI）
  ↓ Docker 内部网络 postgres:5432
Docker 里的 postgres

Docker 里的 worker
  └──────────────→ postgres:5432
```

简单理解：

- `web`：给浏览器发网页，同时把 `/api` 请求转给后端；
- `api`：真正处理登录、宿舍、用电数据和管理后台；
- `worker`：后台定时查电量和发提醒；
- `postgres`：保存账号、宿舍、读数、公告和配置；
- `migrate`：只在部署或升级时运行一次，负责数据库结构升级。

浏览器只应该接触 `web`。数据库和 API 不直接暴露到公网。

---

## 1. 先理解 Docker 的几个词

### 镜像 Image

镜像是“软件安装好的模板”。例如：

```text
python:3.13-slim
postgres:16-alpine
nginx:1.27-alpine
```

第一次启动时 Docker 可能需要下载这些镜像。

### 容器 Container

容器是镜像运行起来后的实例。

可以把它理解成一个轻量、隔离的进程环境。这个项目会运行：

```text
sdu-qingdao-electricity-monitor-api
sdu-qingdao-electricity-monitor-worker
sdu-qingdao-electricity-monitor-postgres
sdu-qingdao-electricity-monitor-web
```

容器可以删除、重建；容器里的临时文件不应该被当作永久数据。

### 卷 Volume

卷是 Docker 管理的永久数据目录。

本项目至少有两个卷：

```text
postgres_data  ← 数据库
uploads_data   ← 管理员上传的背景图等文件
```

删除容器不会删除卷，但执行下面这个命令会删除卷：

```bash
docker compose down -v
```

生产环境不要随便执行 `down -v`。

### 网络 Network

Compose 会给服务创建一张内部网络。服务可以通过服务名找到彼此：

```text
api       → postgres:5432
web       → api:8000
worker    → postgres:5432
```

这里不能写 `127.0.0.1`。

在 `api` 容器里：

```text
127.0.0.1 = api 容器自己
postgres   = PostgreSQL 容器
```

在 `web` 容器里：

```text
127.0.0.1 = web 容器自己
api        = FastAPI 容器
```

### Compose

Compose 是一个 YAML 文件，描述多个容器如何一起启动。

本项目使用：

```bash
docker compose -f compose.prod.yml up -d
```

其中：

- `-f compose.prod.yml`：使用哪个 Compose 文件；
- `up`：创建并启动服务；
- `-d`：后台运行，不占用当前终端。

---

## 2. 先选择代理模式

本教程默认使用**双层 Nginx**，因为项目当前已经适合这种部署方式：

```text
公网
  ↓
宿主机 Nginx：负责 HTTPS
  ↓ 127.0.0.1:8080
Docker web：负责前端和 API 反代
  ↓ api:8000
Docker api
```

这是推荐模式。`web` 只绑定宿主机的 `127.0.0.1:8080`，外部无法直接绕过宿主机 HTTPS 访问它。

### 代理信任链必须这样配置

宿主机 Nginx 直接面对客户端，因此覆盖客户端地址：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

Docker 内的 `web` 只读取宿主机 Nginx 写入的 `X-Real-IP`：

```nginx
proxy_set_header X-Forwarded-For $http_x_real_ip;
```

API 只信任 Docker Compose 网络：

```text
172.30.0.0/24
```

因此配置中会出现：

```env
TRUSTED_PROXY_CIDRS=172.30.0.0/24
```

和：

```text
--forwarded-allow-ips=172.30.0.0/24
```

### 如果你不使用宿主机 Nginx

如果你打算直接把 Docker `web` 暴露给公网，不能继续使用：

```nginx
proxy_set_header X-Forwarded-For $http_x_real_ip;
```

因为没有外层 Nginx 时，`X-Real-IP` 可能为空或来自客户端伪造的请求头。

这种模式要把 `deploy/nginx.conf` 中三处改成：

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

同时仍然保留 Uvicorn 的 `172.30.0.0/24` 限制，并且你仍然需要解决 HTTPS 问题。

本教程后面的命令默认是推荐的“双层宿主机 Nginx”模式。

---

## 3. 开始前需要准备什么

你需要：

- 一台 Linux 服务器，推荐 Ubuntu；
- SSH 登录权限；
- 一个域名，指向服务器 IP（只做本机验证时可以暂时没有域名）；
- HTTPS 证书，或者准备在 HTTP 验证成功后用 Certbot 申请；
- SMTP 邮箱和授权码；
- 如果是迁移旧服务，还需要数据库备份空间。

先确认服务器上没有其他程序占用计划使用的端口：

```bash
sudo ss -lntp
```

本教程中 Docker 的 `web` 使用宿主机：

```text
127.0.0.1:8080
```

宿主机 Nginx 使用：

```text
80 / 443
```

---

## 4. 安装 Docker 和宿主机 Nginx

本教程的服务器假设是 Ubuntu 22.04 或 Ubuntu 24.04。这里使用 Docker 官方 APT 仓库，避免把 Ubuntu 的 `docker.io` 和只在 Docker 官方仓库中提供的 `docker-compose-plugin` 混用。

先安装基础工具和宿主机 Nginx：

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

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
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

不要在这条路径中再安装 `docker.io` 或 `docker-compose-v2`，避免混用两套发行源。

让 Docker 和宿主机 Nginx 开机启动：

```bash
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
```

把当前用户加入 Docker 用户组：

```bash
sudo usermod -aG docker "$USER"
```

然后退出 SSH，再重新登录一次。

验证安装：

```bash
docker version
docker compose version
```

应该能看到 Docker Engine 和 Compose V2 的版本号。

如果 `docker-ce` 找不到，先确认系统版本：

```bash
cat /etc/os-release
```

本教程的仓库地址只支持 Ubuntu；如果服务器是 Debian、CentOS 或其他发行版，不要直接复制 Ubuntu 仓库命令，应改用对应发行版的 Docker 官方安装步骤。

---

## 5. 把项目放到服务器

建议放到：

```text
/opt/sdu-qingdao-electricity-monitor
```

执行：

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

## 6. 准备 Docker 配置文件

需要准备这些文件：

```text
compose.prod.yml
.dockerignore
.env.docker
backend/.env.docker
deploy/backend.Dockerfile
deploy/frontend.Dockerfile
deploy/nginx.conf
```

完整内容请看 `DOCKER_DEPLOYMENT.md` 对应章节。第一次操作不建议凭记忆手写；直接复制完整配置，再只修改域名、密码和 SMTP 信息。

创建目录：

```bash
mkdir -p deploy
```

### 6.1 根环境文件

`.env.docker` 只放 Compose 的 PostgreSQL 密码：

```env
POSTGRES_PASSWORD=换成一条强随机密码
```

### 6.2 后端环境文件

`backend/.env.docker` 至少修改这些配置：

```env
APP_DEBUG=false
ALLOW_INSECURE_STARTUP=false

SECRET_KEY=一条随机长字符串
CREDENTIAL_ENCRYPTION_KEY=另一条随机长字符串

DATABASE_URL=postgresql+psycopg://sdu_power:数据库密码@postgres:5432/sdu_power

CORS_ORIGINS=https://你的域名
TRUSTED_HOSTS=你的域名
TRUSTED_PROXY_CIDRS=172.30.0.0/24

UPLOAD_DIR=/app/uploads

SMTP_HOST=你的SMTP服务器
SMTP_PORT=465
SMTP_USERNAME=你的邮箱
SMTP_PASSWORD=你的邮箱授权码
SMTP_FROM_EMAIL=你的邮箱
SMTP_USE_SSL=true
SMTP_USE_STARTTLS=false
```

### 6.3 两个密码必须对应

这两个地方的数据库密码必须是同一条：

根目录 `.env.docker`：

```env
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_PASSWORD
```

后端 `DATABASE_URL`：

```env
DATABASE_URL=postgresql+psycopg://sdu_power:REPLACE_WITH_A_RANDOM_PASSWORD@postgres:5432/sdu_power
```

数据库主机必须是：

```text
postgres
```

不是：

```text
127.0.0.1
```

建议数据库密码只使用字母、数字和连字符，避免 URL 编码问题。

可以生成一条真正的数据库密码：

```bash
openssl rand -hex 24
```

把命令输出的同一条结果复制到上面两个位置；不要把 `REPLACE_WITH_A_RANDOM_PASSWORD` 原样用于生产。

生成随机密钥：

```bash
openssl rand -hex 32
```

运行两次，把两条不同的结果分别填入 `SECRET_KEY` 和 `CREDENTIAL_ENCRYPTION_KEY`。

保护环境文件：

```bash
chmod 600 .env.docker backend/.env.docker
```

---

## 7. 第一次启动：先只启动数据库

不要一上来启动所有服务。先启动 PostgreSQL：

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

你应该看到类似：

```text
postgres   running (healthy)
```

如果状态不是 `healthy`，查看日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs postgres
```

常见原因：密码为空、磁盘权限错误、旧卷中的数据库损坏。

---

## 8. 初始化数据库

数据库容器健康后，执行项目自己的初始化脚本：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

这条命令的意思是：

- 临时创建一个后端容器；
- 执行 `python -m app.scripts.init_db`；
- 完成后删除这个临时容器；
- 不删除 PostgreSQL 数据卷。

成功时应该看到数据库 revision 和表信息。

如果失败，先看完整输出，不要继续启动 API：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs postgres
```

---

## 9. 启动 API、Worker 和前端

数据库和迁移成功后：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

这条命令会：

1. 构建后端镜像；
2. 构建前端镜像；
3. 创建 Docker 网络；
4. 创建数据库和上传文件卷；
5. 启动 FastAPI；
6. 启动 Worker；
7. 启动前端 Nginx。

查看所有容器：

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

持续查看某个服务：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f worker
```

按 `Ctrl+C` 只会停止查看日志，不会停止容器。

---

## 10. 创建管理员

API 正常运行后：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -m app.scripts.create_admin admin
```

程序会要求输入管理员密码。

这里的 `exec` 和 `run` 不同：

- `exec`：进入已经运行的 API 容器；
- `run`：新建一个临时容器执行命令。

---

## 11. 先在服务器本机测试

Docker web 暂时绑定到：

```text
127.0.0.1:8080
```

在服务器执行：

```bash
curl --fail http://127.0.0.1:8080/health
```

成功时会返回健康检查结果。

测试前端：

```bash
curl --fail -I http://127.0.0.1:8080/
```

测试 API：

```bash
curl -i http://127.0.0.1:8080/api/announcements
```

浏览器 Network 面板中，API 请求应该是：

```text
/api/...
```

不能是：

```text
//api/...
```

因为同源构建不应该设置：

```env
VITE_API_BASE_URL=/
```

同源部署时直接不提供这个变量，让前端自动使用 `window.location.origin`。

---

## 12. 配置宿主机 Nginx 和 HTTPS

这一节分成两阶段：

1. 先用 `127.0.0.1:8080` 验证 Docker web；
2. 再配置宿主机 Nginx 的 HTTP 反代，确认域名能访问后申请 HTTPS 证书。

不要在证书文件还不存在时直接复制带 `ssl_certificate` 的配置。

### 12.1 先验证 Docker web

前面第 11 步成功后，确认下面命令能返回结果：

```bash
curl --fail http://127.0.0.1:8080/health
```

这一步不需要域名，也不需要证书。它只证明 Docker 内部的 `web -> api` 链路正常。

### 12.2 先配置宿主机 HTTP 反代

申请 Let's Encrypt 证书前，需要满足：

- 域名的 A/AAAA 记录已经指向服务器；
- 服务器防火墙允许 80 端口；
- 宿主机 Nginx 已安装并正在运行。

如果还没有安装：

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/electricity-monitor
```

先填入**只有 HTTP** 的配置：

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

启用配置并检查：

```bash
sudo ln -sf /etc/nginx/sites-available/electricity-monitor \
  /etc/nginx/sites-enabled/electricity-monitor

sudo nginx -t
sudo systemctl reload nginx
```

先用 HTTP 验证域名：

```bash
curl --fail http://your-domain.example/health
```

如果这里失败，先修复 DNS、防火墙、Nginx 配置或 Docker web，不要继续申请证书。

### 12.3 申请 HTTPS 证书

推荐使用 Let's Encrypt：

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d your-domain.example
```

Certbot 会验证域名、申请证书，并尝试修改 Nginx 配置。按照提示选择是否将 HTTP 自动跳转到 HTTPS。

证书通常位于：

```text
/etc/letsencrypt/live/your-domain.example/fullchain.pem
/etc/letsencrypt/live/your-domain.example/privkey.pem
```

如果你已经有其他机构签发的证书，可以跳过 Certbot，直接把证书路径填入下一节的 HTTPS 配置。

### 12.4 使用 HTTPS 配置

申请证书后，将站点配置调整为：

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

外层宿主机 Nginx 必须用 `$remote_addr` 覆盖客户端地址，不要把客户端自带的转发链直接传给 Docker web。

检查并重新加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

最后用 HTTPS 验证：

```bash
curl --fail https://your-domain.example/health
```

正式环境不要让用户通过纯 HTTP 登录，因为密码和 token 会被明文传输。

---

## 13. 如果服务器上已经有旧版本

已有 systemd 版本时，不要直接删除旧服务，也不要把旧 PostgreSQL 数据目录挂到新容器。

正确迁移顺序：

```text
停止旧 API / Worker
        ↓
pg_dump -Fc 备份旧数据库
        ↓
启动 Docker PostgreSQL
        ↓
pg_restore 恢复
        ↓
运行 init_db / Alembic
        ↓
确认数据
        ↓
启动 Docker API / Worker / web
        ↓
切换宿主机 Nginx
```

### 13.1 停止旧应用

```bash
sudo systemctl stop sdu-electricity-worker sdu-electricity-api
```

### 13.2 备份旧数据库

```bash
sudo -u postgres pg_dump -Fc sdu_power \
  > "$HOME/sdu_power-before-docker-$(date +%F-%H%M%S).dump"
```

### 13.3 启动新 PostgreSQL

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d postgres
```

### 13.4 恢复数据库

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

这条命令特意使用：

```text
PGPASSWORD="$POSTGRES_PASSWORD"
```

因为 `--env-file` 不会把密码导出到宿主机 shell。

同时使用：

```text
-h 127.0.0.1
```

强制 PostgreSQL 客户端走 TCP，避免 Unix socket 的 peer authentication 问题。

### 13.5 执行项目迁移

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

### 13.6 启动新应用

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

数据库备份不会包含管理员上传的背景图片。旧目录中的上传文件还需要复制到 `uploads_data` 卷，完整命令请看 `DOCKER_DEPLOYMENT.md` 的迁移章节。

---

## 14. 日常最常用的命令

### 看容器状态

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

### 看日志

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs --tail=100 api worker web
```

### 重启一个服务

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  restart api
```

### 停止所有容器，但保留数据卷

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  stop
```

### 启动已有容器

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  start
```

### 查看卷

```bash
docker volume ls
```

### 查看网络

```bash
docker network ls
```

不要在生产环境随便执行：

```bash
docker compose down -v
```

`-v` 会删除数据库和上传文件卷，可能造成不可逆的数据丢失。

---

## 15. 更新代码

```bash
cd /opt/sdu-qingdao-electricity-monitor
git pull
```

先构建镜像：

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

再次验证：

```bash
curl --fail https://your-domain.example/health

docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps
```

---

## 16. 常见错误怎么判断

### 错误：API 连接不上数据库

检查 `DATABASE_URL`：

错误：

```env
...@127.0.0.1:5432/...
```

正确：

```env
...@postgres:5432/...
```

### 错误：Nginx 502

检查 Docker 内 Nginx：

正确：

```nginx
proxy_pass http://api:8000;
```

错误：

```nginx
proxy_pass http://127.0.0.1:8000;
```

查看日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs web api
```

### 错误：前端能打开，API 请求 404

查看浏览器 Network：

```text
正确：/api/announcements
错误：//api/announcements
```

删除 `VITE_API_BASE_URL=/`，重新构建前端。

### 错误：所有用户的 IP 都变成代理地址

检查三处：

```env
TRUSTED_PROXY_CIDRS=172.30.0.0/24
```

```nginx
# 宿主机 Nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

```nginx
# Docker web
proxy_set_header X-Forwarded-For $http_x_real_ip;
```

### 错误：Worker 没有查电量

确认 Worker 真的运行：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  ps worker
```

查看日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f worker
```

---

## 17. 最后检查清单

- [ ] 已安装 Docker 和 Docker Compose
- [ ] 宿主机 Nginx 已安装并运行
- [ ] 已先用 `http://127.0.0.1:8080/health` 验证 Docker web
- [ ] 已先用 HTTP 域名访问 `/health`，再申请 HTTPS 证书
- [ ] 已使用 Certbot 申请证书，或已确认已有证书路径
- [ ] 已准备 `compose.prod.yml`
- [ ] 已准备两个 Dockerfile 和两个 Nginx 配置
- [ ] `DATABASE_URL` 使用 `postgres:5432`
- [ ] 同源部署没有设置 `VITE_API_BASE_URL=/`
- [ ] Compose 网络是 `172.30.0.0/24`
- [ ] `TRUSTED_PROXY_CIDRS=172.30.0.0/24`
- [ ] Uvicorn 的代理信任限制为 `172.30.0.0/24`
- [ ] 宿主机 Nginx 用 `$remote_addr` 覆盖客户端地址
- [ ] 双层模式下 Docker web 使用 `$http_x_real_ip`
- [ ] 如果跳过宿主机 Nginx，已将 Docker web 的三处转发配置改为 `$remote_addr`
- [ ] 根 `.env.docker` 和后端 `DATABASE_URL` 的数据库密码一致
- [ ] 已执行 `python -m app.scripts.init_db`
- [ ] 已创建管理员
- [ ] API、Worker、Web、PostgreSQL 均正常运行
- [ ] `/health` 返回成功
- [ ] 浏览器请求路径是 `/api/...`
- [ ] 正式环境已启用 HTTPS
- [ ] 已备份旧 PostgreSQL 后再迁移
- [ ] 没有直接挂载旧 PostgreSQL 数据目录
- [ ] 没有执行 `docker compose down -v`
