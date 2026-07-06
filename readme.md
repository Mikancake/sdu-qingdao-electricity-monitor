# 🔋 山东大学青岛校区电量监控平台

<div align="center">

**一个面向宿舍的电量查询、趋势记录、邮件提醒与管理后台**

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB.svg)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-4169E1.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)

</div>

---

## 📖 项目简介

本项目基于山东大学校园卡综合服务平台中的电量查询接口，扩展为一个可长期运行的宿舍电量监控平台。

学生可以在网页端注册账号、绑定宿舍、查看电量变化曲线，并在电量不足时收到邮件提醒。管理员可以在后台维护查询 token、SMTP 发信配置、用户配置和全局同步周期。

相比原始单账号脚本，本版本更适合多人、多宿舍、长期开放使用：

- 👥 **多人使用**：多个学生可以绑定同一个宿舍，也可以一个学生绑定多个宿舍
- 📈 **趋势记录**：每次查询都会形成历史点位，前端绘制电量变化曲线
- 📧 **邮件提醒**：支持验证码、测试邮件、低电量提醒和用电日报
- 🧰 **管理后台**：维护 token 池、SMTP、用户、全局调度周期
- ⚙️ **独立 worker**：电量检测和邮件通知从 API 进程中拆出，便于服务器长期运行

> ⚠️ 本项目不是学校官方服务。请合理设置同步周期和请求频率，不要对学校接口造成不必要的压力。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 邮箱账号 | 邮箱注册、验证码验证、密码登录 |
| 🏠 宿舍绑定 | 用户可绑定多个宿舍，一个宿舍也可被多个用户绑定 |
| 📊 电量曲线 | 每次查询保存为历史点，前端按时间连接绘制趋势 |
| 🔎 查询记录 | 用户可查看每次检测的成功/失败记录 |
| 📧 提醒邮箱 | 用户可自定义接收提醒的邮箱，修改时需要验证码验证 |
| ⚠️ 低电量提醒 | 检测到低于阈值后立即发送邮件 |
| 🧪 测试邮件 | 用户可手动发送测试邮件，成功后 30 分钟冷却 |
| 📰 用电日报 | 默认每天 8 点发送，可由用户选择是否开启及间隔天数 |
| 🧑‍💼 管理后台 | 管理用户、token 池、SMTP、全局同步参数和审计日志 |
| 🌙 暗色模式 | 用户端和管理后台均支持暗色模式 |
| 🗄️ 数据库 | 本地默认 SQLite，生产建议 PostgreSQL |

---

## 🧭 系统流程

```mermaid
flowchart LR
    student[学生网页端] --> api[FastAPI 后端]
    admin[管理后台] --> api
    api --> db[(数据库)]
    worker[独立 Worker] --> db
    worker --> campus[校园卡电量接口]
    worker --> smtp[SMTP 邮件服务]
    campus --> worker
    smtp --> mailbox[用户邮箱]
```

```mermaid
sequenceDiagram
    participant W as Worker
    participant D as Database
    participant C as 校园卡接口
    participant M as SMTP
    W->>D: 读取待检查宿舍和可用 token
    W->>C: 查询宿舍当前电量
    C-->>W: 返回电量余额
    W->>D: 保存电量读数和查询记录
    W->>D: 判断是否低于提醒阈值
    W->>M: 发送低电量提醒或日报
```

---

## 📋 系统要求

| 项目 | 开发环境 | 生产建议 |
|------|----------|----------|
| Python | 3.11+ | 3.11+ |
| Node.js | 18+ | 18+ 或仅用于构建 |
| 数据库 | SQLite | PostgreSQL |
| 系统 | Windows / Linux / macOS | Ubuntu / Debian |
| 邮箱 | 支持 SMTP 的邮箱 | 建议使用独立发信邮箱 |
| 网络 | 可访问校园卡综合服务平台 | 服务器需可访问学校电量接口 |

---

## 🚀 快速开始

### 1️⃣ 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
python -m app.scripts.init_db
uvicorn app.main:app --reload
```

启动后访问：

```text
http://127.0.0.1:8000/docs
```

### 2️⃣ 创建管理员

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.create_admin admin
```

根据提示输入管理员密码。管理员用于登录 `/admin` 后台，不是普通学生账号。

### 3️⃣ 启动 worker

worker 负责定时查电量、发送低电量提醒和日报。开发时另开一个终端：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.worker
```

默认检查节奏：

```text
00:00 -> 04:00 -> 08:00 -> 12:00 -> 16:00 -> 20:00
```

### 4️⃣ 启动前端

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

## 📁 项目结构

```text
sdu-qingdao-electricity-monitor/
├── backend/                  # FastAPI 后端、worker 和管理脚本
│   ├── app/
│   │   ├── api/              # API 路由
│   │   ├── core/             # 配置与安全工具
│   │   ├── db/               # 数据库连接和建表
│   │   ├── electricity/      # 校园卡电量接口客户端
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic Schema
│   │   ├── scripts/          # 初始化、导入 token、创建管理员
│   │   ├── services/         # 业务逻辑
│   │   └── worker.py         # 独立调度进程
│   ├── .env.example
│   └── requirements.txt
├── frontend/                 # React 前端和管理后台
│   ├── src/
│   ├── .env.example
│   └── package.json
├── infra/
│   └── docker-compose.yml    # PostgreSQL 开发环境
├── LICENSE.md
└── readme.md
```

---

## ⚙️ 配置说明

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
APP_DEBUG=true
SECRET_KEY="change-this-secret"
DATABASE_URL="sqlite:///./dev.sqlite3"
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"

CHECK_INTERVAL_SECONDS=14400
NOTIFY_INTERVAL_SECONDS=3600
CHECK_BATCH_SIZE=50
CHECK_REQUEST_DELAY_SECONDS=0.5
NOTIFY_COOLDOWN_HOURS=12

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
| `APP_DEBUG=false` | 关闭开发模式，验证码不会直接返回前端 |
| `SECRET_KEY` | 换成随机长字符串 |
| `DATABASE_URL` | 建议改为 PostgreSQL |
| `CORS_ORIGINS` | 改成你的前端域名 |
| `SMTP_*` | 配置发信邮箱和授权码 |

前端配置文件：

```text
frontend/.env
```

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## 🔑 Token 池与宿舍数据

学校电量接口需要 `Synjones-Auth` token。平台支持在管理后台维护 token 池，worker 查询时会选择可用 token，避免单个账号承担所有请求。

### 在管理后台添加

1. 登录 `http://127.0.0.1:5173/admin`
2. 进入 **Token** 页面
3. 填入 token 名称和完整 `bearer ...` 值
4. 保存并启用

### 用命令行导入

也可以在项目根目录准备本地文件 `tokens.yaml`，再执行：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.import_tokens
```

> 🔐 `tokens.yaml` 包含真实 token，已被 `.gitignore` 忽略，不应提交。

宿舍楼参数已经内置，用户绑定宿舍时只需要选择楼栋并填写宿舍号。

---

## 📧 邮件示例

> 下面的宿舍、房间号、电量和时间均为随机示例，不对应真实宿舍。

### ⚠️ 低电量提醒

```text
主题：低电量提醒 - 示例楼A X-204

【低电量提醒】
位置：示例校区 示例楼A X-204
当前剩余电量：2.73 度
提醒阈值：6.00 度
检测时间：2026-01-15 20:00:00

电量可能不足，请及时充值。
```

### 📰 用电日报

```text
主题：用电日报 - 示例楼A X-204

【用电日报】
位置：示例校区 示例楼A X-204
当前剩余电量：48.62 度
最近日均用电：3.17 度
预计可用：15.3 天
报告时间：2026-01-15 08:00:00
```

### 🧪 测试邮件

```text
主题：测试邮件 - SDU Electricity

这是一封测试邮件。
如果你收到这封邮件，说明平台的 SMTP 服务和提醒邮箱配置正常。
```

---

## 🧑‍💼 管理后台

管理后台入口：

```text
http://127.0.0.1:5173/admin
```

| 页面 | 功能 |
|------|------|
| 状态 | 查看用户数、宿舍数、token 数量、SMTP 状态和最近读数 |
| 用户 | 查看、编辑、删除用户，为用户单独覆盖提醒参数 |
| Token | 新增、编辑、启用、删除学校接口 token |
| SMTP | 配置发信邮箱，发送测试邮件 |
| 设置 | 修改全局检查周期、请求间隔、通知周期和冷却时间 |
| 账号 | 修改管理员资料和密码 |
| 审计 | 查看最近管理操作 |

---

## 🗄️ 数据库

本地开发默认 SQLite：

```text
DATABASE_URL="sqlite:///./dev.sqlite3"
```

生产环境建议 PostgreSQL。项目提供了开发用 Compose：

```powershell
docker compose -f infra/docker-compose.yml up -d
```

然后修改 `backend/.env`：

```text
DATABASE_URL="postgresql+psycopg://sdu_power:change-this-dev-password@127.0.0.1:5432/sdu_power"
```

初始化数据库：

```powershell
cd backend
.\.venv\Scripts\activate
python -m app.scripts.init_db
```

---

## 🐧 Ubuntu 部署参考

### 1️⃣ 安装依赖

```bash
sudo apt update
sudo apt install -y git python3 python3-venv nodejs npm postgresql nginx
sudo npm install -g pnpm
```

### 2️⃣ 创建数据库

```bash
sudo -u postgres psql
```

```sql
CREATE USER sdu_power WITH PASSWORD 'change-this-database-password';
CREATE DATABASE sdu_power OWNER sdu_power;
\q
```

### 3️⃣ 部署代码

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

### 4️⃣ 配置 systemd

API 服务：

```ini
[Unit]
Description=SDU Electricity API
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

worker 服务：

```ini
[Unit]
Description=SDU Electricity Worker
After=network.target postgresql.service sdu-electricity-api.service

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

查看日志：

```bash
journalctl -u sdu-electricity-api -f
journalctl -u sdu-electricity-worker -f
```

### 5️⃣ 构建前端

```bash
cd /opt/sdu-qingdao-electricity-monitor/frontend
cp .env.example .env
```

```text
VITE_API_BASE_URL=https://your-domain.example
```

```bash
pnpm install
pnpm run build
```

将 `frontend/dist` 作为 Nginx 静态站点目录，并把 `/api` 反向代理到 `127.0.0.1:8000`。

---

## 🔧 常用命令

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

## ❓ 常见问题

### 1️⃣ 注册验证码发不出去

检查 SMTP 是否配置完整，尤其是 `SMTP_HOST`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM_EMAIL`。

QQ、163 等邮箱通常要使用 **授权码**，不是登录密码。

### 2️⃣ 用户注册后没验证，重新注册提示异常

当前平台不会在验证前创建正式用户。注册但未验证只会保留待验证验证码；重新注册会刷新待验证流程，不会占用正式账号。

### 3️⃣ 手动同步为什么不能一直点

普通用户侧有手动同步冷却，避免大量请求学校接口。管理员可以在后台调整全局冷却，也可以给测试用户单独覆盖。

### 4️⃣ 邮件提醒为什么没有立刻发送

低电量提醒依赖 worker。请确认 `python -m app.worker` 正在长期运行，或服务器上的 `sdu-electricity-worker` systemd 服务处于 active 状态。

### 5️⃣ 页面能打开，但接口请求失败

检查前端的 `VITE_API_BASE_URL` 是否指向正确后端地址，检查后端的 `CORS_ORIGINS` 是否包含前端域名。

---

## 🔐 隐私与安全建议

| 文件/信息 | 风险 | 建议 |
|----------|------|------|
| `backend/.env` | 包含密钥、SMTP 授权码 | 不提交，服务器权限建议 600 |
| `tokens.yaml` | 包含学校接口 token | 不提交，定期更新 |
| `*.sqlite3` / `*.db` | 包含用户和读数数据 | 不提交，生产做好备份 |
| SMTP 授权码 | 可用于发信 | 使用专用邮箱和授权码 |
| `SECRET_KEY` | 影响登录 token 签名 | 生产环境必须更换 |

提交 PR 前建议检查：

```bash
git status --short
git diff --check
git grep -n "bearer\\|SMTP_PASSWORD\\|SECRET_KEY\\|token_value" -- ':!readme.md' ':!backend/.env.example'
```

---

## 📈 维护建议

```bash
# 查看 API 日志
journalctl -u sdu-electricity-api -f

# 查看 worker 日志
journalctl -u sdu-electricity-worker -f

# 查看服务状态
systemctl status sdu-electricity-api
systemctl status sdu-electricity-worker

# 重新启动服务
sudo systemctl restart sdu-electricity-api
sudo systemctl restart sdu-electricity-worker
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本项目
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m "feat: add amazing feature"`
4. 推送分支：`git push origin feature/amazing-feature`
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 **MIT License**，详见 [LICENSE.md](LICENSE.md)。

---

<div align="center">

**如果这个项目对你有帮助，欢迎 Star ⭐**

Made for SDU Qingdao Campus

</div>
