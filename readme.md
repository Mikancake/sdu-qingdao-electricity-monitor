# 🔋 山东大学宿舍电费不足预警脚本

<div align="center">

**自动监控宿舍电量，低电量及时邮件告警**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Debian](https://img.shields.io/badge/Debian-11/12-red.svg)](https://www.debian.org/)


</div>
---

## 📖 项目简介

本系统是一个自动化的宿舍电量监控工具，通过定时查询宿舍电控系统接口，实现：

- ⚠️ **低电量预警**：电量低于阈值时自动发送邮件告警
- 📊 **每日日报**：电量充足时每天 8 点发送电量报告
- 🔔 **智能限流**：同一状态最多发送 3 次警告，避免过度打扰
- 📁 **配置分离**：所有参数通过 YAML 配置文件管理，无需修改代码

适用于山东大学青岛校区宿舍，济南和威海校区可参考修改。



---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔄 定时查询 | 每 4 小时自动查询电量余额 |
| ⚠️ 低电量告警 | 电量 < 5 度时发送邮件警告（可配置） |
| 📧 智能限流 | 同一状态最多发送 3 次，恢复后自动重置 |
| 📊 每日日报 | 每天 8:00 发送电量报告（电量充足时） |
| ❌ 异常告警 | 查询失败时发送通知（最多 3 次） |
| 📁 状态持久化 | JSON 文件记录警告次数，重启不丢失 |
| 🔐 配置分离 | YAML 配置文件，敏感信息与代码分离 |
| 📝 日志记录 | 完整执行日志，便于排查问题 |

---

## 📋 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Debian 11/12（推荐），Ubuntu, CentOS 等 Linux 发行版 |
| Python 版本 | 3.8 或更高 |
| 网络连接 | 可访问校园卡综合服务平台 |
| 邮箱服务 | 支持 SMTP 的邮箱（QQ/163/Gmail 等） |
| 浏览器 | Chrome/Edge/Firefox（用于获取 Token） |

---

## 🛠️ 前期准备：获取 Token 与请求参数

> ⚠️ **重要**：本系统依赖校园卡综合服务平台的认证接口，需先获取有效 Token。

### 步骤 1：登录校园卡综合服务平台

1. 打开浏览器，访问 [山东大学校园卡综合服务平台](https://mcard.sdu.edu.cn/plat-pc/businesslobby)
2. 使用您的学号/工号登录

### 步骤 2：进入电量查询界面

1. 点击顶部菜单 **服务中心**
2. 找到并点击 **青岛电控**
3. 进入电量查询页面
4. 在页面中填入查询条件（校区、楼栋、房间号）

### 步骤 3：打开开发者工具

1. 按 `F12` 打开浏览器开发者工具
2. 切换到 **网络（Network）** 标签


### 步骤 4：触发请求并抓取数据

1. 点击 **确认查询** 或类似按钮
2. 在网络标签中点击名为 `getThirdData` 的请求

### 步骤 5：复制关键信息

#### 🔑 复制 Synjones-Auth（认证 Token）

1. 点击该请求 → 查看 **消息头**或 **标头**
2. 找到 `Synjones-Auth` 字段
3. 复制完整值（以 `bearer ` 开头）：
   ```
   bearer .............
   ```

#### 📦 复制请求参数（Request Payload）

1. 切换到 **载荷（Payload）** 或 **请求** 标签
2. 记录以下关键字段的值：

| 参数 | 示例值 | 说明 |
|------|--------|------|
| `type` | `IEC` | 固定值 |
| `level` | `3` | 固定值 |
| `feeitemid` | `410` | 电费项目 ID |
| `campus` | `青岛校区&青岛校区` | 校区参数 |
| `building` | `1503975832&凤凰居1号楼` | 楼栋参数（ID&名称） |
| `room` | `b000` | 房间号 |


### 步骤 6：验证 Token 与信息有效性
```
1. 将获取到的Token和信息依次填入nettest.py对应位置
2. 运行nettest.py
```
---

## 🚀 快速开始

### 1️⃣ 克隆/下载项目

```bash
# 创建项目目录
mkdir -p ~/power_monitor && cd ~/power_monitor

# 下载项目文件（或手动创建）
git clone <your-repo-url> .
```

### 2️⃣ 创建虚拟环境

```bash
# 创建虚拟环境
python3 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
pip install --upgrade pip
pip install -r requirements.txt
```

### 3️⃣ 配置参数

```bash
# 复制配置示例
cp config.example.yaml config.yaml

# 编辑配置文件
vim config.yaml
```

**关键配置项：**

```yaml
# 🔐 登录 Token（从校园卡综合服务平台抓取）
auth:
  token: "bearer ................"

# 📧 邮箱配置
email:
  sender_email: "your@qq.com"
  sender_password: "your_auth_code"  # 邮箱授权码，非登录密码
  receiver_email: "alert@example.com"

# 📍 宿舍信息（使用前期准备中获取的参数）
location:
  campus: "青岛校区"
  building: "凤凰居1号楼"
  room: "b111"
  campus_param: "青岛校区&青岛校区"
  building_param: "1503975832&凤凰居1号楼"

# ⚙️ 预警阈值
alert:
  low_power_threshold: 5.0  # 低于此值触发告警（度）
```

### 4️⃣ 测试运行

# 1. 激活虚拟环境
```
source .venv/bin/activate
```
# 2. 手动运行测试
```
python3 main.py
```
# 3. 预期成功输出
```
# ==================================================
# 🔋 低电费预警系统启动
# ==================================================
# ✓ 配置文件加载成功：/home/powermon/power_monitor/config.yaml
# 📍 监控位置：青岛校区 凤凰居1号楼 b111
# ...
# ✓ 查询成功：当前电量 42.32 度
# ✓ 电量充足 (42.32 度)
# ✅ 执行完成
# ==================================================
```
# 4. 查看生成的状态文件
```
cat power_alert_state.json
```
### 5️⃣ 设置定时任务

```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每 4 小时执行）
0 */4 * * * cd /home/youruser/power_monitor && /home/youruser/power_monitor/.venv/bin/python3 main.py >> power_alert.log 2>&1

# 验证任务
crontab -l
```

---

## 📁 项目结构

```
power_monitor/
├── main.py                 # 主脚本
├── config.yaml             # 配置文件（需手动编辑）
├── config.example.yaml     # 配置示例
├── nettest.py              # Token/接口连通性测试脚本
├── requirements.txt        # Python 依赖
├── power_alert_state.json  # 状态文件（自动生成）
├── power_alert.log         # 日志文件（自动生成）
└── README.md               # 项目文档
```

---

## ⚙️ 配置说明

### config.yaml 完整参数

```yaml
# 📍 宿舍信息
location:
  campus: "青岛校区"                    # 校区名称（显示用）
  campus_param: "青岛校区&青岛校区"      # 接口参数（从开发者工具复制）
  building: "凤凰居1号楼"                # 楼栋名称（显示用）
  building_param: "1503975832&凤凰居1号楼"  # 接口参数（ID&名称）
  room: "b111"                          # 房间号

# 🔐 认证配置
auth:
  token: "bearer YOUR_TOKEN_HERE"       # 从平台抓取的 Synjones-Auth

# 📧 邮箱配置
email:
  enabled: true                         # 是否启用邮件
  smtp_server: "smtp.qq.com"            # SMTP 服务器
  smtp_port: 465                        # SMTP 端口
  use_ssl: true                         # 是否使用 SSL
  sender_email: "your@qq.com"           # 发送邮箱
  sender_password: "your_auth_code"     # 邮箱授权码
  receiver_email: "alert@example.com"   # 接收邮箱

# ⚙️ 预警配置
alert:
  low_power_threshold: 5.0              # 低电量阈值（度）
  max_alert_count: 3                    # 最大警告次数
  daily_report_hour: 8                  # 日报发送时间（小时）

# 🔌 接口配置（一般无需修改）
api:
  url: "https://mcard.sdu.edu.cn/charge/feeitem/getThirdData"
  type: "IEC"
  level: "3"
  feeitemid: "410"
  timeout: 10

# 📁 文件路径
paths:
  state_file: "power_alert_state.json"
  log_file: "power_alert.log"
```

---

## 📊 邮件示例

### ⚠️ 低电量警告

```
主题：⚠️ 低电量预警 [1/3] - 青岛校区 凤凰居1号楼 b111

【低电费预警通知】
📍 位置：青岛校区 凤凰居1号楼 b111
🔋 当前剩余电量：3.50 度
🚨 预警阈值：5.0 度
⏰ 检测时间：2026-03-07 18:30:00
📧 警告次数：1/3（电量恢复前最多发送 3 次）

⚠️ 电量已低于安全阈值，请及时充值！
```

### 📊 电量日报

```
主题：📊 电量日报 - 青岛校区 凤凰居1号楼 b111

【电量日报】
📍 位置：青岛校区 凤凰居1号楼 b111
🔋 当前剩余电量：42.32 度
📅 报告时间：2026-03-07 08:00:00
📈 预计可用：14.1 天（按日均 3 度估算）

✅ 电量充足，无需充值。
```

### ❌ 查询失败

```
主题：❌ 电量查询失败 [1/3] - 青岛校区 凤凰居1号楼 b111

【查询异常通知】
📍 位置：青岛校区 凤凰居1号楼 b111
❌ 错误信息：HTTP 401: Unauthorized
⏰ 检测时间：2026-03-07 18:30:00
📧 警告次数：1/3（恢复正常前最多发送 3 次）
```

---

## 🔧 常用命令

```bash
# 激活虚拟环境
source .venv/bin/activate

# 手动运行脚本
python3 main.py

# 测试 Token/接口连通性
python3 nettest.py

# 查看日志
tail -f power_alert.log

# 查看状态
cat power_alert_state.json | python3 -m json.tool

# 重置状态（测试用）
echo '{}' > power_alert_state.json

# 检查 cron 服务
sudo systemctl status cron
```

---

## ❓ 常见问题

### 1️⃣ Token 过期（401 错误）

**症状：** `HTTP 401: Unauthorized`

**解决：**
1. 重新登录 [校园卡综合服务平台](https://mcard.sdu.edu.cn/plat-pc/businesslobby)
2. 按「前期准备」步骤重新抓取 `Synjones-Auth`
3. 更新 `config.yaml` 中的 `auth.token`

### 2️⃣ 邮件发送失败

**症状：** `SMTPAuthenticationError`

**解决：**
1. QQ 邮箱：设置 → 账户 → 开启 SMTP → 生成授权码
2. 163 邮箱：设置 → POP3/SMTP/IMAP → 开启服务 → 获取授权码
3. 使用授权码，**非登录密码**

### 3️⃣ Cron 不执行

**症状：** 定时任务无日志输出

**解决：**
```bash
# 检查 cron 服务
sudo systemctl status cron

# 查看 cron 日志
sudo grep CRON /var/log/syslog | tail -20

# 测试 cron 环境
env -i SHELL=/bin/bash PATH=/usr/bin:/bin python3 main.py
```

### 4️⃣ 中文乱码

**解决：**
```bash
# 在 crontab 顶部添加
LANG=zh_CN.UTF-8
LC_ALL=zh_CN.UTF-8
```

### 5️⃣ 请求参数错误

**症状：** `无法解析电量` 或 `信息字段为空`

**解决：**
1. 确认 `campus_param`、`building_param` 与开发者工具中完全一致
2. 检查 `room` 大小写（如 `b111` vs `b111`）
3. 确认 `type=IEC` 和 `level=3` 未修改

---

## 🔐 安全建议

| 项目 | 建议 | 命令 |
|------|------|------|
| 配置文件 | 权限 600 | `chmod 600 config.yaml` |
| 状态文件 | 权限 600 | `chmod 600 power_alert_state.json` |
| 日志文件 | 权限 640 | `chmod 640 power_alert.log` |
| 项目目录 | 权限 700 | `chmod 700 ~/power_monitor` |
| Token | 定期更换 | 建议每周更新 |
| 邮箱密码 | 使用授权码 | 非登录密码 |
| Git 仓库 | 忽略敏感文件 | 见 `.gitignore` |

### .gitignore 示例

```gitignore
# 敏感配置
config.yaml

# 状态文件
power_alert_state.json

# 日志文件
power_alert.log

# Python
__pycache__/
*.pyc
.venv/
```

---

## 📈 监控与维护

### 日常检查

```bash
# 1. 查看最近日志
tail -n 50 ~/power_monitor/power_alert.log

# 2. 搜索错误
grep -i "error\|fail\|401" ~/power_monitor/power_alert.log

# 3. 检查 cron 任务
crontab -l

# 4. 查看状态文件
cat ~/power_monitor/power_alert_state.json
```

### 定期维护

```bash
# 每周：更新 Token
vim ~/power_monitor/config.yaml

# 每月：清理大日志
find ~/power_monitor -name "*.log" -size +10M -exec truncate -s 0 {} \;

# 每季度：更新依赖
source ~/power_monitor/.venv/bin/activate
pip install --upgrade -r requirements.txt
```

---

## 🛠️ 扩展开发

### 添加多宿舍支持

```bash
# 1. 复制配置文件
cp config.yaml config_room106.yaml

# 2. 修改房间信息
vim config_room106.yaml

# 3. 添加 cron 任务
crontab -e
# 添加：
0 */4 * * * cd ~/power_monitor && python3 main.py >> power_alert_106.log 2>&1
```

### 添加钉钉机器人告警

在 `send_email()` 函数旁添加 `send_dingtalk()` 函数，调用钉钉 Webhook API。

---

## 📄 许可证

本项目采用 **MIT 许可证**，详见 [LICENSE](LICENSE) 文件。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request


---

<div align="center">

**⚡ 如果本项目对您有帮助，请给个 Star ⭐**

Made with ❤️ by OrangeHome&qwen | 2026

</div>