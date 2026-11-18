# 🔋 Electricity Monitor

<div align="center">

**面向宿舍场景的电量查询、趋势记录、邮件提醒与管理后台**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)

</div>

---

## 📌 这是什么

Electricity Monitor 是一个把宿舍电量查询脚本扩展成 Web 平台的项目。学生可以注册账号、绑定宿舍、查看电量变化曲线，并在低电量时收到邮件提醒；管理员可以维护 token 池、SMTP 发信配置、用户配置、全局调度周期和外观设置。

它适合长期跑在自己的服务器上，服务多个用户和多个宿舍。它不是学校官方服务，也不应被包装成官方平台；请合理设置同步周期和请求频率。

学生端按总览、宿舍、记录、设置组织，只加载当前页面所需的数据；管理端在手机上提供底部导航。操作反馈可手动关闭，不遮挡整页或中断键盘输入。亮色与深色主题共享服务端保存的背景和玻璃材质参数。

<table>
  <tr>
    <td><strong>👩‍🎓 学生端</strong><br/>绑定宿舍、查看曲线、设置提醒邮箱、发送测试邮件</td>
    <td><strong>🧑‍💼 管理后台</strong><br/>管理用户、宿舍、Token、SMTP、全局设置和外观</td>
    <td><strong>⚙️ 独立 Worker</strong><br/>定时查询电量、保存读数、发送低电量提醒和日报</td>
  </tr>
</table>

---

## ✨ 功能一览

| 能力 | 说明 |
|------|------|
| 🔐 邮箱账号 | 邮箱注册、验证码验证、密码登录 |
| 🏠 宿舍绑定 | 一个用户可绑定多个宿舍，一个宿舍也可被多个用户绑定 |
| ✅ 绑定校验 | 添加或修改宿舍时会立即查询一次电量，确认宿舍可查询 |
| 📈 电量曲线 | 每次成功查询保存读数；优先按学校系统的真实更新时间连接绘制趋势 |
| ⚠️ 低电量提醒 | 支持固定阈值、按可用天数、按 1 天用电量提醒 |
| 📮 邮件服务 | 注册验证码、测试邮件、低电量提醒、用电日报 |
| 🔌 多查询源 | 旧一卡通接口与新 HWGL 接口按楼宇自动路由，互不影响 |
| 🔑 Token 池 | 旧一卡通查询使用多个 token 轮换；HWGL 查询不消耗 token |
| 🧑‍💼 管理后台 | 管理用户、宿舍、Token、SMTP、全局参数、审计日志，并通过可选 Dashboard 图表查看查询、发信、用户与宿舍楼统计 |
| 🎨 外观设置 | 支持亮色/暗色背景、玻璃效果和全局主题配置 |
| 🧹 数据保留 | 支持清理验证码、查询记录、通知、审计日志等过期数据 |

---

## 🧭 系统流程

GitHub 的 Mermaid 渲染对部分语法和中文标签不够稳定，这里使用原生 Markdown 展示流程，保证在仓库首页稳定显示。

### 🧩 模块关系

| 图标 | 模块 | 连接 | 说明 |
|------|------|------|------|
| 👩‍🎓 | 学生网页端 | `学生端 -> FastAPI API` | 注册、登录、绑定宿舍、查看曲线、设置提醒 |
| 🧑‍💼 | 管理后台 | `管理后台 -> FastAPI API` | 管理用户、宿舍、Token、SMTP 和全局设置 |
| 🚀 | FastAPI API | `API -> 数据库` | 提供用户端和管理后台接口 |
| ⚙️ | 独立 Worker | `Worker -> 数据库` | 读取待检查宿舍、保存读数、生成通知 |
| 🔌 | 电量查询接口 | `Worker -> 电量查询接口 -> Worker` | 查询宿舍当前剩余电量 |
| 📮 | SMTP 邮件服务 | `Worker -> SMTP -> 用户邮箱` | 发送验证码、提醒邮件和用电日报 |

### 🔄 一次检查如何发生

```text
① Worker 从数据库读取待检查宿舍，并根据楼宇选择查询 Provider
② 旧一卡通 Provider 预留可用 token；HWGL Provider 直接查询，不使用 token
③ Worker 保存余额、学校系统更新时间、官方日用电量和查询记录
④ Worker 按有效观测时长计算余额下降日均值；充值或赠电只排除所在区间，不重置此前的用电记录
⑤ 低于阈值时，Worker 通过 SMTP 发送提醒邮件
⑥ 用户在网页端查看最新电量、历史曲线和查询记录
```

### 🔌 电量查询 Provider

| Provider | 适用楼宇 | 是否使用 Token 池 | 保存的数据 |
|----------|----------|--------------------|------------|
| `mcard` | 原一卡通系统仍可查询的楼宇 | 是 | 当前余额、查询时间 |
| `hwgl` | 凤凰居 11/13 号楼 | 否 | 当前余额、上游更新时间、日用电量、免费/付费/欠费电量、当前电价、充值记录 |

后端会在用户绑定宿舍时从 HWGL 宿舍目录解析真正的电表标识和线路号，并把结果缓存到宿舍记录中。后续定时检查直接使用已解析标识；当上游标识失效时会刷新目录并重新解析。凤凰居 11/13 号楼在平台中始终作为一个楼宇显示；上游的 11 公寓和 13 公寓仅作为内部电表解析标识，不会拆成两个用户可选项。

升级脚本可以从 HWGL 按自然日回填真实历史记录。某个宿舍至少成功取得一条 HWGL 记录后，才会删除该宿舍已知不准确的旧 `mcard` 曲线；失败时保留旧记录用于恢复，但学生端、日报和提醒只读取宿舍当前 Provider 的数据，不会继续使用冻结的余额。

日均用电量 = 有效区间的余额下降总量 ÷ 有效观测天数。按数据更新时间去重；总余额或付费/免费分项明显上升（超过 0.05 度），或区间内有已入账的 HWGL 充值记录时，这段的电量和时长都不参与估算。不会把充值金额当作用电量。连续有效观测可以跨越多次充值累积；查询源变化、至少 3 天的断档或持续静默仍划分新的活跃期。窗口内累计满 24 小时且至少两次有效下降才给出实测日均，否则暂用平台默认值。

HWGL 的充值记录与日用电明细会由独立的元数据同步任务更新。充值订单不会以明文订单号保存，只保留用于去重的哈希和很短的末尾标识。管理员还可以在“实时性”页面启动隔离探测，观察余额快照是否变化、接口延迟和上游更新时间间隔；探测样本不会进入学生端曲线、日均用电计算或邮件通知。

### 管理员实时性探测的目标与参数

“实时性”页面的宿舍下拉框读取的是数据库 `rooms` 表中已经保存的 HWGL 宿舍，所以早期手动测试时留下的房间号也可能出现在列表中。它不是前端随机生成的；例如 `2222222` 如果仍然显示，说明数据库里存在对应的历史房间记录。管理员可以先用列表旁的筛选框定位它。

现在也可以选择“手动输入并验证”：输入宿舍号后，后端会先查询 HWGL 的公开宿舍目录，确认房间存在并解析电表标识，验证通过后才创建探测任务。自定义目标会以 `probe_only` 标记保存，仅供管理员探测使用，不会出现在普通用户宿舍列表，也不会被正常同步、日均计算或邮件通知处理；如果以后有用户绑定同一位置，绑定流程会将它转为普通宿舍记录。

- 请求间隔：支持预设值，也可以自定义 `60–3600` 秒。
- 持续时间：支持预设值，也可以自定义分钟数，但不能超过“设置”页面中的 HWGL 探测最长持续时间。
- “自动匹配”无法区分同号房间时，可选择 `11 侧` 或 `13 侧`；平台对外仍统一显示为“凤凰居11/13号楼”。

---

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI, SQLAlchemy, Pydantic Settings |
| 前端 | React, TypeScript, Vite, Tailwind CSS, 原生 SVG 图表 |
| 数据库 | SQLite / PostgreSQL |
| 调度 | 独立 Worker 进程 |
| 邮件 | SMTP |
| 部署 | systemd + Nginx，或按需自行容器化 |

---

## 🚀 快速开始

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

## 📁 项目结构

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
│   ├── docker-compose.yml    # PostgreSQL 开发环境
│   └── nginx.example.conf    # Nginx 反向代理与安全头示例
├── LICENSE.md
└── readme.md
```

---

## ⚙️ 配置

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
CREDENTIAL_ENCRYPTION_KEY="replace-with-a-different-random-secret-at-least-32-chars"
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
TRUSTED_HOSTS=""
TRUSTED_PROXY_CIDRS="127.0.0.1/32,::1/128"
SECURITY_HEADERS_ENABLED=true
DATABASE_URL="sqlite:///./dev.sqlite3"
MAX_REQUEST_BODY_BYTES=1048576

HWGL_API_BASE_URL="http://www.hwgl.qd.sdu.edu.cn/lwwaterpower"
HWGL_API_TIMEOUT=10
HWGL_DIRECTORY_CACHE_SECONDS=3600
HWGL_CAMPUS_NAME="山东大学青岛校区"
HWGL_PAY_TYPE="sl"
HWGL_METADATA_SYNC_INTERVAL_SECONDS=86400
HWGL_METADATA_HISTORY_DAYS=30
HWGL_RECHARGE_HISTORY_DAYS=180
HWGL_PROBE_MAX_DURATION_SECONDS=7200

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
| `CREDENTIAL_ENCRYPTION_KEY` | 使用另一条随机密钥，加密数据库中的查询 token 和 SMTP 密码 |
| `DATABASE_URL` | 建议使用 PostgreSQL |
| `CORS_ORIGINS` | 改成你的前端访问地址 |
| `TRUSTED_HOSTS` | 可留空并从 `CORS_ORIGINS` 推导；不要在生产使用 `*` |
| `TRUSTED_PROXY_CIDRS` | 只填写直接连接 API 的反向代理地址；同机 Nginx 使用默认值即可 |
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

## 🔑 Token 池

旧一卡通电量接口需要 `Synjones-Auth` token。平台支持多个 token；凤凰居 11/13 号楼使用的 HWGL Provider 不会读取、预留或写入 Token 健康日志：

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

## 📧 邮件内容示例

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

## 🧑‍💼 管理后台

入口：

```text
http://127.0.0.1:5173/admin
```

| 页面 | 功能 |
|------|------|
| 状态 | 查看用户数、宿舍数、token 数量、SMTP 状态和最近读数 |
| 用户 | 查看、编辑、删除用户，为用户单独覆盖提醒参数 |
| 宿舍 | 查看所有宿舍、绑定人数、绑定邮箱、当前电量和 HWGL 电量构成；可打开单个宿舍的历史曲线与充值记录 |
| 实时性 | 管理员专用的 HWGL 隔离探测，查看快照变化、接口延迟和上游更新时间间隔 |
| 设置 | 修改检查周期、请求间隔、通知周期、用户绑定上限、数据保留、HWGL 元数据同步和实时性探测上限 |
| Token | 新增、编辑、启用、删除查询 token |
| SMTP | 配置发信邮箱，发送测试邮件 |
| 外观 | 设置亮色/暗色背景图、玻璃效果和页面材质 |
| 账号 | 修改管理员资料和密码 |
| 审计 | 查看最近管理操作 |

---

## 🗄️ 数据库

本地默认 SQLite：

```text
DATABASE_URL="sqlite:///./dev.sqlite3"
```

生产建议 PostgreSQL。项目提供开发用 Compose：

```powershell
$env:POSTGRES_PASSWORD="replace-with-a-strong-random-password"
docker compose -f infra/docker-compose.yml up -d
Remove-Item Env:POSTGRES_PASSWORD
```

Compose 只把 PostgreSQL 绑定到 `127.0.0.1:5432`，并且未设置 `POSTGRES_PASSWORD` 时会拒绝启动。

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

`init_db` 是统一的数据库初始化/升级入口：旧版数据库首次运行时会先补齐兼容结构并记录 Alembic 基线，之后会自动执行 `alembic upgrade head`。部署新版本前应先备份数据库，再运行一次该命令；不要直接手改生产表结构。

读数表保留余额、平台查询时间和上游更新时间等字段。日均估算不叠加上游的 `reported_daily_usage`，避免把同一天的重复日用电量计入多次。余额无法反映区间内每一次变化：如果一笔入账完全被同期用电抵消，又没有分项变化或入账记录，无法仅凭净余额还原该段真实用量。

---

## 🐧 Ubuntu 部署参考

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
CREDENTIAL_ENCRYPTION_KEY="replace-with-a-different-long-random-string"
DATABASE_URL="postgresql+psycopg://sdu_power:change-this-database-password@127.0.0.1:5432/sdu_power"
CORS_ORIGINS="https://your-domain.example"
TRUSTED_HOSTS="your-domain.example"
TRUSTED_PROXY_CIDRS="127.0.0.1/32,::1/128"

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
python -m app.scripts.encrypt_credentials
```

`encrypt_credentials` 会把已有查询 token 和 SMTP 密码原地迁移为 AES-GCM 密文。轮换加密密钥时，先把旧密钥临时放进 `CREDENTIAL_ENCRYPTION_OLD_KEYS`，运行迁移后再清空旧密钥。

### 4. systemd

API 服务示例：

```ini
[Unit]
Description=Electricity Monitor API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/sdu-qingdao-electricity-monitor/backend
EnvironmentFile=/opt/sdu-qingdao-electricity-monitor/backend/.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/opt/sdu-qingdao-electricity-monitor/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1 --no-server-header
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

当前限流状态保存在 API 进程内；在换成 Redis 等共享限流后端之前，请保持单个 Uvicorn worker，不要添加 `--workers 2` 之类的参数。

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
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

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

将 `frontend/dist` 作为 Nginx 静态站点目录，并把 `/api` 反向代理到 `127.0.0.1:8000`。仓库中的 `infra/nginx.example.conf` 已包含转发 IP 覆盖、敏感文件拒绝、请求体限制和浏览器安全头，可按实际 IP/域名修改后使用。

> 登录密码和访问 token 不能通过明文 HTTP 对外传输。内网测试可以暂用 IP，正式开放前仍应配置 HTTPS；没有域名时可使用受信任的内网 CA、VPN，或先限制为可信内网访问。

---

## 🛠️ 常用命令

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

## 🔐 隐私与安全

| 文件/信息 | 风险 | 建议 |
|----------|------|------|
| `backend/.env` | 包含密钥、SMTP 授权码 | 不提交，服务器权限建议 600 |
| `tokens.yaml` / `tokens.json` | 包含查询 token | 不提交，定期更新 |
| `*.sqlite3` / `*.db` | 包含用户和读数数据 | 不提交，生产做好备份 |
| `backend/uploads/` | 可能包含自定义背景图 | 不提交 |
| `SECRET_KEY` | 影响登录 token 签名 | 生产环境必须更换 |
| `CREDENTIAL_ENCRYPTION_KEY` | 保护数据库和备份中的外部凭据 | 与 `SECRET_KEY` 分开保存，权限建议 600 |
| HTTP 明文访问 | 密码和登录 token 可被同网段窃听 | 正式开放前启用 HTTPS |
| PostgreSQL 端口 | 暴露后可能被直接探测或撞库 | 只监听 `127.0.0.1`，并用防火墙限制 |

提交前建议检查：

```bash
git status --short
git diff --check
git grep -n "bearer\\|SMTP_PASSWORD\\|SECRET_KEY\\|token_value" -- ':!readme.md' ':!backend/.env.example'
```

---

## 📈 维护

```bash
# 查看服务状态
systemctl status sdu-electricity-api
systemctl status sdu-electricity-worker

# 查看日志
journalctl -u sdu-electricity-api -f
journalctl -u sdu-electricity-worker -f

# 更新代码后：升级依赖和数据库
cd /opt/sdu-qingdao-electricity-monitor/backend
source .venv/bin/activate
pip install -r requirements.txt
python -m app.scripts.init_db
deactivate

# 重新构建前端
cd /opt/sdu-qingdao-electricity-monitor/frontend
pnpm install --frozen-lockfile
pnpm run build

# 重启服务
sudo systemctl restart sdu-electricity-api sdu-electricity-worker
sudo systemctl reload nginx
```

Worker 的检查、通知、日报和数据清理均使用数据库持久化时间槽。进程重启后会补执行当前应完成但尚未成功的时间槽，并记录失败与重试状态；已成功时间槽不会重复执行。调度记录默认保留 90 天，可在管理后台的数据保留设置中修改。

### 现有部署升级注意事项

- 个人查询记录只包含本人操作及所绑宿舍的系统巡检；同住用户的手动操作不再出现在自己的列表或 CSV。共享电表的余额曲线仍按宿舍展示。
- 提醒邮箱验证码与发起申请的账号绑定。升级前尚未使用的旧提醒邮箱验证码，请等发送冷却结束后重新申请；这不影响已验证的提醒邮箱。
- 正式环境的 `SECRET_KEY` 和 `CREDENTIAL_ENCRYPTION_KEY` 必须独立设置，不能沿用模板值。更换签名密钥会令已有会话失效；如果库中已存 Token 或 SMTP 凭据，不要直接丢弃旧加密密钥，先按上文 `encrypt_credentials` 流程轮换。

### 从旧版升级到 HWGL Provider

这次更新包含正式数据库迁移。升级前先备份 PostgreSQL，并在迁移期间停止 API 与 Worker，避免旧进程继续写入旧结构：

```bash
cd /opt/sdu-qingdao-electricity-monitor

sudo systemctl stop sdu-electricity-worker sdu-electricity-api
sudo -u postgres pg_dump -Fc sdu_power \
  > "$HOME/sdu_power-before-hwgl-$(date +%F-%H%M%S).dump"

cd backend
source .venv/bin/activate
pip install -r requirements.txt
python -m app.scripts.init_db
python -m app.scripts.refresh_hwgl_rooms --days 30
deactivate

cd ../frontend
pnpm install --frozen-lockfile
pnpm run build

sudo systemctl start sdu-electricity-api sdu-electricity-worker
sudo systemctl reload nginx
curl --fail http://127.0.0.1:8000/health
```

如果服务器没有 `pnpm`，可以先安装，或者使用项目原先可正常构建前端的 Node 包管理器。现有 `.env` 不添加 `HWGL_*` 也能使用默认配置；服务器需要能够通过 HTTP 访问 `www.hwgl.qd.sdu.edu.cn:80`。Nginx 入站配置不需要因为这次 Provider 更新而修改。

升级后可检查迁移与 Provider 分布：

```bash
cd /opt/sdu-qingdao-electricity-monitor/backend
source .venv/bin/activate
python -m alembic current
deactivate

sudo -u postgres psql -d sdu_power -c \
  "SELECT provider, COUNT(*) FROM rooms GROUP BY provider ORDER BY provider;"

sudo journalctl -u sdu-electricity-api -n 80 --no-pager
sudo journalctl -u sdu-electricity-worker -n 80 --no-pager
```

数据库版本应为 `20260907_0007`。旧的凤凰居 11/13 绑定会原地切换为 `hwgl`，并统一显示为一个“凤凰居 11/13 号楼”；上游 11/13 公寓名称只保留在内部解析字段中。`refresh_hwgl_rooms` 默认回填最近 30 个自然日，并在每个宿舍成功回填后删除该宿舍原来冻结的 `mcard` 读数；重复执行会按上游更新时间、用电日期和余额去重，不会重复堆积相同历史点。需要暂时保留旧读数时可加 `--keep-legacy`。

> 新接口提供更准确的上游更新时间，但平台不会自动提高请求频率。默认仍按全局 `CHECK_INTERVAL_SECONDS=14400`（4 小时）检查；管理员降低全局周期后可获得更多曲线点，同时也会提高其他楼宇旧接口的请求频率。

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

本项目采用 [MIT License](LICENSE.md)。

<div align="center">

**Electricity Monitor**

让宿舍电量提醒安静、稳定、可维护地运行。

</div>
