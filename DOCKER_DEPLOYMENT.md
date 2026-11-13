# Electricity Monitor：Docker 全栈部署指南

> 入门学习与完整部署步骤已合并到 [`DOCKER_LEARNING_DEPLOYMENT_GUIDE.md`](DOCKER_LEARNING_DEPLOYMENT_GUIDE.md)。本文保留为详细配置参考。

本文说明如何把 Electricity Monitor 的 **PostgreSQL、FastAPI API、Worker 和前端 Nginx** 全部部署到 Docker Compose。

第一次使用 Docker，建议先阅读更通俗的操作流程：[`DOCKER_BEGINNER_GUIDE.md`](DOCKER_BEGINNER_GUIDE.md)。本文作为完整配置和迁移参考。

## 先看结论

当前仓库中的 `infra/docker-compose.yml` **只启动 PostgreSQL**，不是完整生产 Compose。全栈容器化需要额外准备：

```text
web / Nginx  ->  api:8000  ->  postgres:5432
worker       ->  postgres:5432
```

容器之间必须使用 Compose 服务名通信：

- Nginx 使用 `proxy_pass http://api:8000`
- API 使用 `postgresql+psycopg://...@postgres:5432/...`
- 不要在容器间通信配置中使用 `127.0.0.1`
- 容器里的 `127.0.0.1` 只代表当前容器

生产环境只对外暴露 `web`，不要暴露 API 和 PostgreSQL 端口。

---

## 一、最终架构

| 服务 | 作用 |
|---|---|
| `postgres` | PostgreSQL 数据库 |
| `migrate` | 一次性执行数据库初始化 / Alembic 迁移 |
| `api` | FastAPI API |
| `worker` | 定时查询电量、发送提醒、日报和数据清理 |
| `web` | Nginx，提供前端静态文件并反向代理 API |

```text
浏览器
  │
  ▼
web / nginx
  ├── 静态前端
  ├── /api/*       -> http://api:8000
  ├── /health      -> http://api:8000/health
  └── /uploads/*   -> http://api:8000/uploads/*
                           │
                           ▼
                       postgres:5432
```

---

## 二、准备文件

建议新增以下文件，保留现有的 `infra/docker-compose.yml` 作为开发数据库配置：

```text
compose.prod.yml
.dockerignore
.env.docker
deploy/
├── backend.Dockerfile
├── frontend.Dockerfile
└── nginx.conf
backend/.env.docker
```

---

## 三、后端镜像

创建 `deploy/backend.Dockerfile`：

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

CMD [
  "uvicorn",
  "app.main:app",
  "--host", "0.0.0.0",
  "--port", "8000",
  "--proxy-headers",
  "--forwarded-allow-ips=172.30.0.0/24",
  "--no-server-header"
]
```

API 不发布宿主机端口，只允许同一 Docker 网络中的 Nginx 访问，因此 Compose 中 API 只使用 `expose`，不要使用 `ports`。

---

## 四、前端和 Nginx 镜像

创建 `deploy/frontend.Dockerfile`：

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

### 同源 API 地址说明

这里**故意没有设置** `VITE_API_BASE_URL`。

当前前端 `api.ts` 在生产环境没有这个变量时，会回退到：

```ts
window.location.origin
```

因此浏览器请求会使用：

```text
/api/...
```

不要设置：

```env
VITE_API_BASE_URL=/
```

否则可能拼出：

```text
//api/...
```

如果确实需要指定地址，必须写完整 URL：

```env
VITE_API_BASE_URL=https://electricity.example.com
```

同源部署时最简单、最安全的做法是完全不提供这个变量。

### 代理信任链（本指南采用双层 Nginx）

生产部署中 `web` 只绑定宿主机 `127.0.0.1:8080`，因此公网请求先经过宿主机 Nginx，再进入 Docker 内的 Nginx。两层代理必须明确划分信任边界：

1. 宿主机 Nginx 直接面对客户端，使用 `$remote_addr` 覆盖 `X-Real-IP` 和 `X-Forwarded-For`；不要直接透传或追加客户端提供的转发链。
2. Docker 内 Nginx 只读取宿主机 Nginx 写入的 `X-Real-IP`，使用 `$http_x_real_ip` 设置发给 API 的 `X-Forwarded-For`。
3. Uvicorn 只信任 Compose 的 `172.30.0.0/24` 网段，不使用通配符信任代理。

如果不使用外层宿主机 Nginx、而是直接把 Docker `web` 暴露给客户端，应将容器 Nginx 的 `X-Forwarded-For` 改为 `$remote_addr`，不要使用 `$http_x_real_ip`；同时仍保留 Uvicorn 的网段限制。


---

## 五、容器内 Nginx 配置

创建 `deploy/nginx.conf`：

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
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;

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

注意：现有 `infra/nginx.example.conf` 使用的是宿主机架构：

```nginx
proxy_pass http://127.0.0.1:8000;
```

它不能原样用于全栈 Compose。容器内必须改为：

```nginx
proxy_pass http://api:8000;
```

---

## 六、生产 Compose

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

关键配置：

```text
Nginx -> api:8000
API   -> postgres:5432
网络  -> 172.30.0.0/24
```

PostgreSQL、API、Worker 都没有直接暴露给公网。

---

## 七、环境变量

根目录 `.env.docker` 只给 Compose 做变量插值：

```env
POSTGRES_PASSWORD=请换成强随机密码
```

后端 `backend/.env.docker`：

```env
APP_NAME=Electricity Monitor
APP_DEBUG=false
ALLOW_INSECURE_STARTUP=false

SECRET_KEY=生成一条独立的随机长字符串
CREDENTIAL_ENCRYPTION_KEY=再生成另一条独立的随机长字符串
CREDENTIAL_ENCRYPTION_OLD_KEYS=

ACCESS_TOKEN_EXPIRE_MINUTES=10080

DATABASE_URL=postgresql+psycopg://sdu_power:数据库密码@postgres:5432/sdu_power

CORS_ORIGINS=https://your-domain.example
TRUSTED_HOSTS=your-domain.example

# 必须匹配 Compose 的 appnet 网段
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

### 数据库密码必须一致

根目录：

```env
POSTGRES_PASSWORD=同一条数据库密码
```

后端连接字符串：

```env
DATABASE_URL=postgresql+psycopg://sdu_power:同一条数据库密码@postgres:5432/sdu_power
```

如果密码包含 `@`、`:`、`/`、`#` 等字符，需要在 `DATABASE_URL` 中 URL 编码。建议直接使用字母、数字和连字符组成的数据库密码。

生成密钥：

```bash
openssl rand -hex 32
```

执行两次，分别给 `SECRET_KEY` 和 `CREDENTIAL_ENCRYPTION_KEY`。不要使用同一条密钥。

不要提交环境文件：

```bash
chmod 600 .env.docker backend/.env.docker
```

---

## 八、`.dockerignore`

项目根目录创建 `.dockerignore`：

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

这样不会把密钥、SQLite 数据库、旧上传文件和 `node_modules` 打入镜像。

---

## 九、服务器安装 Docker

Ubuntu：

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

重新登录 SSH 后确认：

```bash
docker version
docker compose version
```

---

## 十、全新部署

进入项目目录：

```bash
cd /opt/sdu-qingdao-electricity-monitor
```

先检查 Compose 配置：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  config
```

启动 PostgreSQL：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d postgres
```

执行数据库初始化：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

启动 API、Worker、前端：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

创建管理员：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -m app.scripts.create_admin admin
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

---

## 十一、验证

容器内 Nginx 暂时绑定到宿主机 `127.0.0.1:8080`，先在服务器上验证：

```bash
curl --fail http://127.0.0.1:8080/health
curl --fail -I http://127.0.0.1:8080/
```

验证 API 路由没有多余斜杠：

```bash
curl -i http://127.0.0.1:8080/api/announcements
```

浏览器开发者工具 Network 中应看到：

```text
/api/...
```

而不是：

```text
//api/...
```

确认 API 能解析数据库服务名：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -c "import socket; print(socket.gethostbyname('postgres'))"
```

确认数据库初始化可执行：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  exec api \
  python -m app.scripts.init_db
```

---

## 十二、HTTPS

Compose 内部的 `web` 只监听：

```text
127.0.0.1:8080
```

正式环境建议使用宿主机 Nginx 或 Caddy 终止 HTTPS：

```text
公网 HTTPS
    ↓
宿主机 Nginx :443
    ↓
127.0.0.1:8080
    ↓
Docker web
    ↓
Docker api
```

宿主机 Nginx 核心配置：

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

正式环境不要通过纯 HTTP 传输登录密码和访问 token。

---

## 十三、迁移已有 PostgreSQL 数据

不要把旧 PostgreSQL 数据目录直接挂载到新的 `postgres:16-alpine` 容器。

正确流程：

```text
旧 PostgreSQL
    ↓ pg_dump -Fc
新 PostgreSQL 容器
    ↓ pg_restore
init_db / Alembic upgrade
    ↓
启动 API 和 Worker
```

### 1. 停止旧应用

```bash
sudo systemctl stop sdu-electricity-worker sdu-electricity-api
```

### 2. 备份旧数据库

```bash
sudo -u postgres pg_dump -Fc sdu_power \
  > "$HOME/sdu_power-before-docker-$(date +%F-%H%M%S).dump"
```

### 3. 启动新 PostgreSQL

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d postgres
```

### 4. 恢复数据库

下面的命令在 PostgreSQL 容器内部使用 `POSTGRES_PASSWORD`，不会依赖宿主机 shell 是否导出了变量：

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

关键点：

- `PGPASSWORD="$POSTGRES_PASSWORD"`：显式提供认证密码
- `-h 127.0.0.1`：强制 TCP，避免 Unix socket peer authentication
- `POSTGRES_PASSWORD` 与 `backend/.env.docker` 中 `DATABASE_URL` 的密码必须一致
- `--no-owner`：避免旧环境数据库用户不存在导致恢复失败

### 5. 执行项目迁移

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  run --rm migrate
```

### 6. 迁移上传文件

数据库备份不会包含管理员上传的背景图等文件。检查旧目录：

```text
/opt/sdu-qingdao-electricity-monitor/backend/uploads
```

查看 Compose 卷名：

```bash
docker volume ls
```

将旧文件复制到新的 `uploads_data` 卷：

```bash
docker run --rm \
  -v sdu-qingdao-electricity-monitor_uploads_data:/dst \
  -v /opt/sdu-qingdao-electricity-monitor/backend/uploads:/src:ro \
  alpine \
  sh -c 'cp -a /src/. /dst/'
```

实际卷名可能包含 Compose 项目前缀，以 `docker volume ls` 的结果为准。

### 7. 启动新应用

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  up -d api worker web
```

---

## 十四、更新流程

每次更新：

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

停止 API 和 Worker 后执行迁移：

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

如果迁移失败，不要继续切流；根据备份恢复数据库并检查具体迁移错误。

---

## 十五、常见问题

### API 报数据库连接失败

错误配置：

```env
DATABASE_URL=postgresql+psycopg://...@127.0.0.1:5432/sdu_power
```

容器化配置：

```env
DATABASE_URL=postgresql+psycopg://...@postgres:5432/sdu_power
```

### Nginx 返回 502

检查是否错误使用：

```nginx
proxy_pass http://127.0.0.1:8000;
```

容器内应使用：

```nginx
proxy_pass http://api:8000;
```

查看日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs web api
```

### 前端能打开但 API 请求失败

检查：

```env
CORS_ORIGINS=https://your-domain.example
TRUSTED_HOSTS=your-domain.example
```

同时确认浏览器 Network 中请求路径是：

```text
/api/...
```

不是：

```text
//api/...
```

### Worker 没有执行任务

必须同时启动：

```text
api + worker + postgres + web
```

查看 Worker 日志：

```bash
docker compose \
  --env-file .env.docker \
  -f compose.prod.yml \
  logs -f worker
```

---

## 最终检查清单

- [ ] `DATABASE_URL` 使用 `postgres:5432`
- [ ] Nginx 使用 `proxy_pass http://api:8000`
- [ ] 没有设置 `VITE_API_BASE_URL=/`
- [ ] 同源构建未提供 `VITE_API_BASE_URL`
- [ ] Compose 网络固定为 `172.30.0.0/24`
- [ ] `TRUSTED_PROXY_CIDRS=172.30.0.0/24`
- [ ] 内层 Nginx 使用 `$http_x_real_ip`，外层宿主机 Nginx 使用 `$remote_addr` 覆盖客户端地址
- [ ] 根 `.env.docker` 和后端数据库连接字符串密码一致
- [ ] 已备份现有 PostgreSQL
- [ ] 已使用 `pg_dump -Fc` / `pg_restore` 迁移，而不是直接挂载旧数据目录
- [ ] 已执行 `python -m app.scripts.init_db`
- [ ] API、Worker、Web、PostgreSQL 容器均正常
- [ ] `/health` 返回成功
- [ ] 浏览器请求路径为 `/api/...`
- [ ] 正式环境已启用 HTTPS
