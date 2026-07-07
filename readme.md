# Electricity Monitor

<div align="center">

**面向宿舍场景的电量查询、趋势记录、邮件提醒与管理后台**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)

</div>

---

## 这是什么

Electricity Monitor 是一个把宿舍电量查询脚本扩展成 Web 平台的项目。学生可以注册账号、绑定宿舍、查看电量变化曲线，并在低电量时收到邮件提醒；管理员可以维护 token 池、SMTP 发信配置、用户配置、全局调度周期和外观设置。

它适合长期跑在自己的服务器上，服务多个用户和多个宿舍。它不是学校官方服务，也不应被包装成官方平台；请合理设置同步周期和请求频率。

<table>
  <tr>
    <td><strong>学生端</strong><br/>绑定宿舍、查看曲线、设置提醒邮箱、发送测试邮件</td>
    <td><strong>管理后台</strong><br/>管理用户、宿舍、Token、SMTP、全局设置和外观</td>
    <td><strong>独立 Worker</strong><br/>定时查询电量、保存读数、发送低电量提醒和日报</td>
  </tr>
</table>

---

## 功能一览

| 能力 | 说明 |
|------|------|
| 邮箱账号 | 邮箱注册、验证码验证、密码登录 |
| 宿舍绑定 | 一个用户可绑定多个宿舍，一个宿舍也可被多个用户绑定 |
| 绑定校验 | 添加或修改宿舍时会立即查询一次电量，确认宿舍可查询 |
| 电量曲线 | 每次查询保存为历史点，前端按时间连接绘制趋势 |
| 低电量提醒 | 支持固定阈值、按可用天数、按 1 天用电量提醒 |
| 邮件服务 | 注册验证码、测试邮件、低电量提醒、用电日报 |
| Token 池 | 多个查询 token 按可用时间轮换，避免单个账号承担所有请求 |
| 管理后台 | 管理用户、宿舍、Token、SMTP、全局参数、审计日志 |
| 外观设置 | 支持亮色/暗色背景、玻璃效果和全局主题配置 |
| 数据保留 | 支持清理验证码、查询记录、通知、审计日志等过期数据 |

---

## 系统流程

```mermaid
flowchart LR
    student["学生网页端"] --> api["FastAPI API"]
    admin["管理后台"] --> api
    api --> database["数据库"]
    worker["独立 Worker"] --> database
    worker --> campus["电量查询接口"]
    worker --> smtp["SMTP 邮件服务"]
    campus --> worker
    smtp --> mailbox["用户邮箱"]
```

```mermaid
sequenceDiagram
    participant Worker as Worker
    participant DB as Database
    participant Campus as 电量查询接口
    participant Mail as SMTP
    Worker->>DB: 读取待检查宿舍和可用 token
    Worker->>Campus: 查询宿舍当前电量
    Campus-->>Worker: 返回电量余额
    Worker->>DB: 保存电量读数和查询记录
    Worker->>DB: 计算提醒阈值
    Worker->>Mail: 发送低电量提醒或用电日报
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI, SQLAlchemy, Pydantic Settings |
| 前端 | React, TypeScript, Vite, Tailwind CSS, Recharts |
| 数据库 | SQLite / PostgreSQL |
| 调度 | 独立 Worker 进程 |
| 邮件 | SMTP |
| 部署 | systemd + Nginx，或按需自行容器化 |

---

## 快速开始

### 1. 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
python -m app.scripts.init_db
uvicorn app.main:app --reload
```

后端文档：

```text
http://127.0.0.1:8000/docs
```

### 2. 创建管理员

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.create_admin admin
```

管理员用于登录 `/admin` 后台，不是普通学生账号。

### 3. 启动 Worker

Worker 负责定时查电量、保存读数、发送提醒。开发时另开一个终端：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.worker
```

默认检查周期为每 4 小时一次，推荐按整点运行：

```text
00:00 -> 04:00 -> 08:00 -> 12:00 -> 16:00 -> 20:00
```

### 4. 启动前端

```powershell
cd frontend
npm install
npm run dev
```

访问地址：

```text
学生端：http://127.0.0.1:5173
管理端：http://127.0.0.1:5173/admin
```

---

## 项目结构

```text
sdu-qingdao-electricity-monitor/
├── backend/
│   ├── app/
│   │   ├── api/              # API 路由
│   │   ├── core/             # 配置与安全工具
│   │   ├── db/               # 数据库连接和建表
│   │   ├── electricity/      # 电量接口客户端
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic Schema
│   │   ├── scripts/          # 初始化、导入 token、创建管理员
│   │   ├── services/         # 业务逻辑
│   │   └── worker.py         # 独立调度进程
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   ├── .env.example
│   └── package.json
├── infra/
│   └── docker-compose.yml    # PostgreSQL 开发环境
├── LICENSE.md
└── readme.md
```

---

## 配置

后端配置文件：

```text
backend/.env
```

从示例复制：

```powershell
cd backend
Copy-Item .env.example .env
```

常用配置项：

```text
APP_DEBUG=false
SECRET_KEY="replace-with-a-random-secret-at-least-32-chars"
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
DATABASE_URL="sqlite:///./dev.sqlite3"

CHECK_INTERVAL_SECONDS=14400
CHECK_BATCH_SIZE=50
CHECK_REQUEST_DELAY_SECONDS=0.5
NOTIFY_INTERVAL_SECONDS=3600
NOTIFY_COOLDOWN_HOURS=12

DEFAULT_ALERT_DAYS=1
DEFAULT_DAILY_USAGE_KWH=5.0
MAX_ROOMS_PER_USER=3

SMTP_HOST=""
SMTP_PORT=465
SMTP_USERNAME=""
SMTP_PASSWORD=""
SMTP_FROM_EMAIL=""
SMTP_USE_SSL=true
SMTP_USE_STARTTLS=false
```

生产环境至少需要修改：

| 配置 | 说明 |
|------|------|
| `SECRET_KEY` | 换成随机长字符串 |
| `DATABASE_URL` | 建议使用 PostgreSQL |
| `CORS_ORIGINS` | 改成你的前端访问地址 |
| `SMTP_*` | 配置发信邮箱和授权码 |
| `INITIAL_ADMIN_*` | 首次创建管理员可用；创建后建议从 `.env` 删除 |

前端配置文件：

```text
frontend/.env
```

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## Token 池

电量查询接口需要 `Synjones-Auth` token。平台支持多个 token：

1. 从管理后台新增、编辑、启用或停用 token。
2. 查询时优先使用从未使用过的 token。
3. 都使用过以后，选择下一次可用时间最早的 token。
4. 每个 token 可单独设置最小调用间隔。

命令行导入也可用：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.import_tokens
```

本地 token 文件应命名为 `tokens.yaml` / `tokens.json` 等，已经被 `.gitignore` 忽略。

---

## 邮件内容示例

下面的宿舍、房间号、电量和时间均为随机示例，不对应真实宿舍。

### 低电量提醒

```text
主题：低电量提醒 - 示例楼A X-204

位置：示例校区 示例楼A X-204
当前剩余电量：2.73 度
提醒阈值：6.00 度
检测时间：2026-01-15 20:00:00

电量可能不足，请及时充值。
```

### 用电日报

```text
主题：用电日报 - 示例楼A X-204

位置：示例校区 示例楼A X-204
当前剩余电量：48.62 度
最近日均用电：3.17 度/天
预计可用：15.3 天
报告时间：2026-01-15 08:00:00
```

---

## 管理后台

入口：

```text
http://127.0.0.1:5173/admin
```

| 页面 | 功能 |
|------|------|
| 状态 | 查看用户数、宿舍数、token 数量、SMTP 状态和最近读数 |
| 用户 | 查看、编辑、删除用户，为用户单独覆盖提醒参数 |
| 宿舍 | 查看所有宿舍，以及绑定人数和绑定邮箱 |
| Token | 新增、编辑、启用、删除查询 token |
| SMTP | 配置发信邮箱，发送测试邮件 |
| 设置 | 修改检查周期、请求间隔、通知周期、用户绑定上限、数据保留策略 |
| 外观 | 设置亮色/暗色背景图、玻璃效果和页面材质 |
| 账号 | 修改管理员资料和密码 |
| 审计 | 查看最近管理操作 |

---

## 数据库

本地默认 SQLite：

```text
DATABASE_URL="sqlite:///./dev.sqlite3"
```

生产建议 PostgreSQL。项目提供开发用 Compose：

```powershell
docker compose -f infra/docker-compose.yml up -d
```

然后修改 `backend/.env`：

```text
DATABASE_URL="postgresql+psycopg://sdu_power:change-this-dev-password@127.0.0.1:5432/sdu_power"
```

初始化：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.init_db
```

---

## Ubuntu 部署参考

### 1. 安装依赖

```bash
sudo apt update
sudo apt install -y git python3 python3-venv nodejs npm postgresql nginx
```

如需使用 pnpm：

```bash
sudo npm install -g pnpm
```

### 2. 创建数据库

```bash
sudo -u postgres psql
```

```sql
CREATE USER sdu_power WITH PASSWORD 'change-this-database-password';
CREATE DATABASE sdu_power OWNER sdu_power;
\q
```

### 3. 部署后端

```bash
sudo mkdir -p /opt/sdu-qingdao-electricity-monitor
sudo chown -R $USER:$USER /opt/sdu-qingdao-electricity-monitor
git clone <your-fork-url> /opt/sdu-qingdao-electricity-monitor

cd /opt/sdu-qingdao-electricity-monitor/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

编辑 `backend/.env`：

```text
APP_DEBUG=false
SECRET_KEY="replace-with-a-long-random-string"
DATABASE_URL="postgresql+psycopg://sdu_power:change-this-database-password@127.0.0.1:5432/sdu_power"
CORS_ORIGINS="https://your-domain.example"

SMTP_HOST="smtp.example.com"
SMTP_PORT=465
SMTP_USERNAME="your-smtp-account"
SMTP_PASSWORD="your-smtp-app-password"
SMTP_FROM_EMAIL="your-smtp-account"
SMTP_USE_SSL=true
SMTP_USE_STARTTLS=false
```

初始化：

```bash
python -m app.scripts.init_db
python -m app.scripts.create_admin admin
```

### 4. systemd

API 服务示例：

```ini
[Unit]
Description=Electricity Monitor API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/sdu-qingdao-electricity-monitor/backend
EnvironmentFile=/opt/sdu-qingdao-electricity-monitor/backend/.env
ExecStart=/opt/sdu-qingdao-electricity-monitor/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Worker 服务示例：

```ini
[Unit]
Description=Electricity Monitor Worker
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/sdu-qingdao-electricity-monitor/backend
EnvironmentFile=/opt/sdu-qingdao-electricity-monitor/backend/.env
ExecStart=/opt/sdu-qingdao-electricity-monitor/backend/.venv/bin/python -m app.worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sdu-electricity-api
sudo systemctl enable --now sdu-electricity-worker
```

### 5. 构建前端

```bash
cd /opt/sdu-qingdao-electricity-monitor/frontend
cp .env.example .env
```

```text
VITE_API_BASE_URL=https://your-domain.example
```

```bash
npm install
npm run build
```

将 `frontend/dist` 作为 Nginx 静态站点目录，并把 `/api` 反向代理到 `127.0.0.1:8000`。

---

## 常用命令

```bash
# 初始化数据库
python -m app.scripts.init_db

# 创建管理员
python -m app.scripts.create_admin admin

# 导入 token
python -m app.scripts.import_tokens

# 手动执行一轮检查
python -m app.scripts.run_checks

# 手动扫描提醒
python -m app.scripts.run_notifications

# 启动 worker
python -m app.worker
```

---

## 常见问题

### 注册验证码发不出去

检查 SMTP 配置，尤其是 `SMTP_HOST`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM_EMAIL`。QQ、163 等邮箱通常要使用授权码，不是登录密码。

### 页面能打开，但接口请求失败

检查前端 `VITE_API_BASE_URL` 是否指向正确后端地址，检查后端 `CORS_ORIGINS` 是否包含前端访问地址。

### 手动同步为什么不能一直点

普通用户侧有手动同步冷却，避免大量请求电量接口。管理员可以在后台调整全局冷却，也可以给测试用户单独覆盖。

### 第二个 token 为什么没有被使用

只有真实电量查询才会更新 token 的最近使用时间。刷新后台 token 列表不会调用 token。请触发一次宿舍检查、绑定校验或 worker 定时检查后再查看。

### 低电量提醒没有发送

确认 Worker 正在运行，并检查 SMTP 配置和通知冷却时间。

---

## 隐私与安全

| 文件/信息 | 风险 | 建议 |
|----------|------|------|
| `backend/.env` | 包含密钥、SMTP 授权码 | 不提交，服务器权限建议 600 |
| `tokens.yaml` / `tokens.json` | 包含查询 token | 不提交，定期更新 |
| `*.sqlite3` / `*.db` | 包含用户和读数数据 | 不提交，生产做好备份 |
| `backend/uploads/` | 可能包含自定义背景图 | 不提交 |
| `SECRET_KEY` | 影响登录 token 签名 | 生产环境必须更换 |

提交前建议检查：

```bash
git status --short
git diff --check
git grep -n "bearer\\|SMTP_PASSWORD\\|SECRET_KEY\\|token_value" -- ':!readme.md' ':!backend/.env.example'
```

---

## 维护

```bash
# 查看服务状态
systemctl status sdu-electricity-api
systemctl status sdu-electricity-worker

# 查看日志
journalctl -u sdu-electricity-api -f
journalctl -u sdu-electricity-worker -f

# 重启服务
sudo systemctl restart sdu-electricity-api sdu-electricity-worker
sudo systemctl reload nginx
```

---

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本项目
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m "feat: add amazing feature"`
4. 推送分支：`git push origin feature/amazing-feature`
5. 开启 Pull Request

---

## 许可证

本项目采用 [MIT License](LICENSE.md)。

<div align="center">

**Electricity Monitor**

让宿舍电量提醒安静、稳定、可维护地运行。

</div>
