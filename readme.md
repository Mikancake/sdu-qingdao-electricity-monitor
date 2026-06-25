# 山东大学青岛校区宿舍电量监控脚本

自动查询山东大学青岛校区宿舍电量，并通过邮件发送低电量提醒、查询异常提醒和电量日报。

本分支支持多宿舍、多收件人、Token 池轮询、SQLite 状态持久化，以及检测和发信解耦，适合部署在 Ubuntu 服务器上长期运行。

## 功能

- 多宿舍监控：一个脚本可以管理多个宿舍。
- 固定发信邮箱：所有通知统一从同一个 SMTP 邮箱发出。
- 多收件人：每个宿舍可以配置一个或多个通知邮箱。
- Token 池：多个 `Synjones-Auth` token 轮询使用，降低单个账号短时间高频请求风险。
- 检测和通知解耦：`check` 只查询电量并生成通知队列，`notify` 只发送队列里的邮件。
- SQLite 状态库：保存每个宿舍的电量历史、告警次数、下次检查时间和通知队列。
- 命令行管理宿舍：通过 `roomctl.py` 增加宿舍、追加收件人、启用或禁用宿舍。

## 项目文件

```text
.
├── main.py                 # 主程序：检测电量、发送通知、测试邮件
├── nettest.py              # Token 池连通性测试
├── roomctl.py              # rooms.csv 管理工具
├── config.example.yaml     # 主配置示例
├── tokens.example.yaml     # Token 池示例
├── rooms.example.csv       # 宿舍清单示例
├── requirements.txt
└── readme.md
```

运行后会生成：

```text
config.yaml                 # 本地真实配置，已被 .gitignore 忽略
tokens.yaml                 # 本地真实 Token 池，已被 .gitignore 忽略
rooms.csv                   # 本地真实宿舍清单，已被 .gitignore 忽略
power_monitor.sqlite3       # 本地状态库，已被 .gitignore 忽略
power_alert.log             # 本地日志，已被 .gitignore 忽略
```

## 安装

推荐在 Ubuntu 服务器上运行：

```bash
git clone https://github.com/Mikancake/sdu-qingdao-electricity-monitor.git
cd sdu-qingdao-electricity-monitor

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 配置

复制示例文件：

```bash
cp config.example.yaml config.yaml
cp tokens.example.yaml tokens.yaml
cp rooms.example.csv rooms.csv
```

编辑 `config.yaml`：

```yaml
email:
  enabled: true
  smtp_server: "smtp.163.com"
  smtp_port: 465
  use_ssl: true
  sender_email: "your_email@163.com"
  sender_password: "your_email_auth_code"
  send_retries: 2
  retry_delay_seconds: 3

tokens_file: "tokens.yaml"
rooms_file: "rooms.csv"
```

`sender_password` 应填写邮箱 SMTP 授权码，不是邮箱登录密码。

常见 SMTP 配置：

```yaml
# SSL
smtp_port: 465
use_ssl: true

# STARTTLS
smtp_port: 587
use_ssl: false
```

## Token 池

编辑 `tokens.yaml`：

```yaml
tokens:
  - id: "account_1"
    value: "bearer your_token_here"
    enabled: true
    min_interval_seconds: 10
    cooldown_seconds: 300
```

字段说明：

- `id`：Token 名称，只用于日志和状态记录。
- `value`：浏览器请求头中的完整 `Synjones-Auth` 值。
- `enabled`：是否启用。
- `min_interval_seconds`：同一个 Token 两次使用之间的最小间隔。
- `cooldown_seconds`：Token 发生鉴权或网络异常后的冷却时间。

## 宿舍清单

少量宿舍可以手动编辑 `rooms.csv`，大量宿舍建议使用 `roomctl.py`。

CSV 字段：

```csv
id,campus,campus_param,building_key,building_param,room,receivers,check_interval_minutes,low_power_threshold,enabled
fenghuang_1-a219,青岛校区,青岛校区&青岛校区,fenghuang_1,,a219,user@qq.com,240,,true
```

推荐使用 `building_key`，它会引用 `config.yaml` 中的 `building_params`，避免每个宿舍重复写楼宇接口参数。

当前示例包含这些青岛校区楼宇参数：

```yaml
building_params:
  fenghuang_1: "1503975832&凤凰居1号楼"
  fenghuang_2: "1503975890&凤凰居2号楼"
  fenghuang_3: "1503975902&凤凰居3号楼"
  fenghuang_4: "1503975950&凤凰居4号楼"
  fenghuang_5: "1503975967&凤凰居5号楼"
  fenghuang_6: "1503975980&凤凰居6号楼"
  fenghuang_7: "1503975988&凤凰居7号楼"
  fenghuang_8: "1503975995&凤凰居8号楼"
  fenghuang_9: "1503976004&凤凰居9号楼"
  fenghuang_10: "1503976037&凤凰居10号楼"
  fenghuang_11_13: "1599193777&凤凰居11/13号楼"
  yuehai_b1: "1661835249&阅海居B1楼"
  yuehai_b2: "1661835256&阅海居B2楼"
  yuehai_b5: "1661835273&阅海居B5楼"
  yuehai_b9: "1693031698&阅海居B9楼"
  yuehai_b10: "1693031710&阅海居B10楼"
```

## 使用 roomctl.py 管理宿舍

列出宿舍：

```bash
python roomctl.py list
```

新增宿舍：

```bash
python roomctl.py add \
  --building-key fenghuang_1 \
  --room a219 \
  --receiver user@qq.com
```

指定 ID：

```bash
python roomctl.py add \
  --id fenghuang_1-a219 \
  --building-key fenghuang_1 \
  --room a219 \
  --receiver user@qq.com
```

追加收件人：

```bash
python roomctl.py add-receiver \
  --room-id fenghuang_1-a219 \
  --receiver roommate@qq.com
```

启用或禁用宿舍：

```bash
python roomctl.py enable --room-id fenghuang_1-a219
python roomctl.py disable --room-id fenghuang_1-a219
```

覆盖更新已有宿舍：

```bash
python roomctl.py add \
  --id fenghuang_1-a219 \
  --building-key fenghuang_1 \
  --room a219 \
  --receiver new@qq.com \
  --update
```

## 命令

校验配置：

```bash
python main.py --validate
```

测试所有启用 Token：

```bash
python nettest.py
```

指定宿舍测试 Token：

```bash
python nettest.py --room-id fenghuang_1-a219
```

查询到期宿舍电量，只写入状态和通知队列，不发邮件：

```bash
python main.py --check
```

发送通知队列中的邮件：

```bash
python main.py --notify
```

检查并发送通知队列：

```bash
python main.py
```

强制检查所有宿舍：

```bash
python main.py --check-all
```

立即发送一封测试邮件：

```bash
python main.py --test-email --room-id fenghuang_1-a219
```

立即给所有启用宿舍发送测试邮件：

```bash
python main.py --test-email --all
```

## Ubuntu 定时运行

建议用 cron 分开执行检测和发信：

```bash
crontab -e
```

添加：

```cron
*/5 * * * * cd /home/youruser/sdu-qingdao-electricity-monitor && /home/youruser/sdu-qingdao-electricity-monitor/.venv/bin/python main.py --check >> power_alert.log 2>&1
*/5 * * * * cd /home/youruser/sdu-qingdao-electricity-monitor && /home/youruser/sdu-qingdao-electricity-monitor/.venv/bin/python main.py --notify >> power_alert.log 2>&1
```

cron 每 5 分钟只是唤醒脚本。每个宿舍的实际检测周期由 `config.yaml` 控制：

```yaml
check:
  default_interval_minutes: 240
  batch_size: 20
  request_interval_seconds: 3
  jitter_seconds: 60
```

例如 1000 个宿舍、4 小时检查一次，平均每分钟只需要检查约 4 个宿舍。`batch_size` 和 `request_interval_seconds` 可以避免请求集中爆发。

## 状态和通知队列

脚本会自动创建 `power_monitor.sqlite3`。其中保存：

- 每个宿舍的下次检查时间
- 最近电量和历史电量
- 低电量告警次数
- 查询异常告警次数
- 每日报告状态
- 待发送通知队列

这意味着检测和发信可以独立运行。即使一次邮件发送失败，也不会影响后续电量检测。

## 安全建议

真实配置文件已在 `.gitignore` 中忽略，不应提交到 Git：

```text
config.yaml
tokens.yaml
rooms.csv
power_monitor.sqlite3
power_alert.log
.env
*.bak
```

服务器上建议设置权限：

```bash
chmod 700 .
chmod 600 config.yaml tokens.yaml rooms.csv
```

不要使用 `git add -f config.yaml tokens.yaml rooms.csv` 强制添加真实配置。

## 常见问题

### 邮件发送出现 `[SSL] record layer failure`

通常是 SMTP 连接的 TLS 握手失败。若部分邮件成功、部分失败，多半是网络或邮箱服务器临时断开连接。脚本默认会自动重试：

```yaml
email:
  send_retries: 2
  retry_delay_seconds: 3
```

如果全部邮件都失败，请检查端口和加密方式是否匹配：

```yaml
smtp_port: 465
use_ssl: true
```

或：

```yaml
smtp_port: 587
use_ssl: false
```

### Token 失效

运行：

```bash
python nettest.py
```

如果返回 `401` 或 `403`，需要重新从校园卡系统抓取 `Synjones-Auth` 并更新 `tokens.yaml`。

### 宿舍参数错误

如果返回“信息字段为空”或“无法解析电量”，优先检查：

- `building_key` 是否存在于 `building_params`
- `room` 大小写是否和页面请求一致
- `campus_param` 是否为 `青岛校区&青岛校区`

## 许可证

本项目采用 MIT 许可证，详见 `LICENSE.md`。
