
"""
低电费预警脚本
作者：OrangeHome&qwen
日期：2026 年
"""

import re
import json
import smtplib
import requests
import os
import sys
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from pathlib import Path

# 尝试导入 yaml，如未安装则提示
try:
    import yaml
except ImportError:
    print("❌ 缺少依赖：pyyaml")
    print("💡 请运行：pip install pyyaml")
    sys.exit(1)


# ================= 配置加载 =================

def load_config(config_file: str = "config.yaml") -> dict:
    """加载配置文件"""
    config_path = Path(__file__).parent / config_file

    if not config_path.exists():
        print(f"❌ 配置文件不存在：{config_path}")
        print(f"💡 请复制 config.yaml.example 为 {config_file} 并修改配置")
        sys.exit(1)

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        print(f"✓ 配置文件加载成功：{config_path}")
        
        # 验证必需的配置项
        _validate_config(config)
        
        return config
    except yaml.YAMLError as e:
        print(f"❌ 配置文件解析失败：{e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 读取配置文件失败：{e}")
        sys.exit(1)


def _validate_config(config: dict):
    """验证配置文件的必需字段"""
    required_fields = [
        ("auth.token", ["auth", "token"]),
        ("location.room", ["location", "room"]),
        ("location.campus_param", ["location", "campus_param"]),
        ("location.building_param", ["location", "building_param"]),
        ("api.url", ["api", "url"]),
    ]
    
    errors = []
    
    for field_name, keys in required_fields:
        value = config
        try:
            for key in keys:
                value = value[key]
            # 检查值是否为空或仍是占位符
            if not value or "YOUR_" in str(value).upper() or "..." in str(value):
                errors.append(f"  • {field_name}: 未配置或使用了占位符")
        except (KeyError, TypeError):
            errors.append(f"  • {field_name}: 缺失")
    
    # 验证邮箱配置（如果启用）
    if config.get("email", {}).get("enabled", True):
        email_fields = [
            ("email.sender_email", ["email", "sender_email"]),
            ("email.sender_password", ["email", "sender_password"]),
            ("email.receiver_email", ["email", "receiver_email"]),
            ("email.smtp_server", ["email", "smtp_server"]),
        ]
        
        for field_name, keys in email_fields:
            value = config
            try:
                for key in keys:
                    value = value[key]
                if not value or "YOUR_" in str(value).upper() or "your" in str(value).lower():
                    errors.append(f"  • {field_name}: 未配置或使用了占位符")
            except (KeyError, TypeError):
                errors.append(f"  • {field_name}: 缺失")
    
    if errors:
        print("❌ 配置验证失败，以下字段存在问题：")
        for error in errors:
            print(error)
        print("\n💡 请检查 config.yaml 并填写正确的配置信息")
        sys.exit(1)
    
    print("✓ 配置验证通过")


# ================= 状态管理 =================

class AlertState:
    """告警状态管理器（持久化到 JSON 文件）"""

    def __init__(self, state_file: Path):
        self.state_file = state_file
        self.state = self._load_state()
        self.config = {}  # 初始化配置字典，避免 AttributeError

    def _load_state(self) -> dict:
        """加载状态文件"""
        default_state = {
            "low_power_alert_count": 0,
            "low_power_last_alert": None,
            "error_alert_count": 0,
            "error_last_alert": None,
            "last_daily_report": None,
            "last_success_time": None,
            "last_known_balance": None,
        }

        if self.state_file.exists():
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    default_state.update(loaded)
            except (json.JSONDecodeError, IOError) as e:
                print(f"⚠️  状态文件读取失败：{e}，使用默认状态")
        else:
            print(f"ℹ️  状态文件不存在，将创建：{self.state_file}")

        return default_state

    def save(self):
        """保存状态到文件"""
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
            os.chmod(self.state_file, 0o600)
        except IOError as e:
            print(f"✗ 状态文件保存失败：{e}")

    def reset_low_power_alert(self):
        """重置低电量警告计数"""
        if self.state["low_power_alert_count"] > 0:
            print(f"✓ 电量恢复正常，重置低电量警告计数 ({self.state['low_power_alert_count']} → 0)")
        self.state["low_power_alert_count"] = 0
        self.state["low_power_last_alert"] = None
        self.save()

    def reset_error_alert(self):
        """重置请求失败警告计数"""
        if self.state["error_alert_count"] > 0:
            print(f"✓ 查询恢复正常，重置错误警告计数 ({self.state['error_alert_count']} → 0)")
        self.state["error_alert_count"] = 0
        self.state["error_last_alert"] = None
        self.save()

    def can_send_low_power_alert(self) -> bool:
        return self.state["low_power_alert_count"] < self.config.get("max_alert_count", 3)

    def increment_low_power_alert(self):
        self.state["low_power_alert_count"] += 1
        self.state["low_power_last_alert"] = datetime.now().isoformat()
        self.save()
        print(f"📊 低电量警告计数：{self.state['low_power_alert_count']}/{self.config.get('max_alert_count', 3)}")

    def can_send_error_alert(self) -> bool:
        return self.state["error_alert_count"] < self.config.get("max_alert_count", 3)

    def increment_error_alert(self):
        self.state["error_alert_count"] += 1
        self.state["error_last_alert"] = datetime.now().isoformat()
        self.save()
        print(f"📊 错误警告计数：{self.state['error_alert_count']}/{self.config.get('max_alert_count', 3)}")

    def should_send_daily_report(self) -> bool:
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        if now.hour != self.config.get("daily_report_hour", 8):
            return False
        if self.state["last_daily_report"] == today:
            return False
        return True

    def mark_daily_report_sent(self):
        self.state["last_daily_report"] = datetime.now().strftime("%Y-%m-%d")
        self.save()

    def update_success(self, balance: float):
        self.state["last_success_time"] = datetime.now().isoformat()
        self.state["last_known_balance"] = balance
        self.save()

    def set_config(self, config: dict):
        """设置配置引用（用于获取 max_alert_count 等）"""
        self.config = config


# ================= 邮件发送 =================

def send_email(config: dict, subject: str, body: str) -> bool:
    """发送邮件"""
    email_cfg = config.get("email", {})

    if not email_cfg.get("enabled", True):
        print("⚠️  邮件通知已禁用，跳过发送")
        return False

    if not all([email_cfg.get("sender_email"), email_cfg.get("sender_password"), email_cfg.get("receiver_email")]):
        print("⚠️  邮箱配置不完整，跳过邮件发送")
        return False

    try:
        message = MIMEMultipart()
        message["From"] = email_cfg["sender_email"]
        message["To"] = email_cfg["receiver_email"]
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain", "utf-8"))

        if email_cfg.get("use_ssl", True):
            server = smtplib.SMTP_SSL(email_cfg["smtp_server"], email_cfg["smtp_port"], timeout=10)
        else:
            server = smtplib.SMTP(email_cfg["smtp_server"], email_cfg["smtp_port"], timeout=10)
            server.starttls()

        server.login(email_cfg["sender_email"], email_cfg["sender_password"])
        server.sendmail(email_cfg["sender_email"], [email_cfg["receiver_email"]], message.as_string())
        server.quit()

        print(f"✓ 邮件已发送至：{email_cfg['receiver_email']}")
        return True

    except smtplib.SMTPAuthenticationError:
        print("✗ 邮箱认证失败，请检查邮箱账号/授权码")
        return False
    except Exception as e:
        print(f"✗ 邮件发送异常：{type(e).__name__}: {e}")
        return False


def send_low_power_alert(config: dict, balance: float, alert_count: int, max_count: int) -> bool:
    """发送低电量警告邮件"""
    loc = config.get("location", {})
    location = f"{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}"
    threshold = config.get("alert", {}).get("low_power_threshold", 5.0)

    subject = f"⚠️ 低电量预警 [{alert_count}/{max_count}] - {location}"

    body = f"""
【低电费预警通知】

📍 位置：{location}
🔋 当前剩余电量：{balance:.2f} 度
🚨 预警阈值：{threshold} 度
⏰ 检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📧 警告次数：{alert_count}/{max_count}（电量恢复前最多发送{max_count}次）

⚠️ 电量已低于安全阈值，请及时充值，避免断电影响生活！

💡 提示：充值后电量恢复，警告将自动停止。

—— 自动监控脚本
    """.strip()

    return send_email(config, subject, body)


def send_error_alert(config: dict, error_msg: str, alert_count: int, max_count: int) -> bool:
    """发送请求失败警告邮件"""
    loc = config.get("location", {})
    location = f"{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}"

    subject = f"❌ 电量查询失败 [{alert_count}/{max_count}] - {location}"

    body = f"""
【查询异常通知】

📍 位置：{location}
❌ 错误信息：{error_msg}
⏰ 检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📧 警告次数：{alert_count}/{max_count}（恢复正常前最多发送{max_count}次）

⚠️ 电量查询接口异常，请检查：
  1. 网络连接是否正常
  2. Token 是否过期（需重新登录小程序）
  3. 是否在校园网/已连接 VPN

💡 提示：查询恢复正常后，警告将自动停止。

—— 自动监控脚本
    """.strip()

    return send_email(config, subject, body)


def send_daily_report(config: dict, balance: float) -> bool:
    """发送电量日报"""
    loc = config.get("location", {})
    location = f"{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}"
    report_hour = config.get("alert", {}).get("daily_report_hour", 8)

    estimated_days = balance / 3.0 if balance > 0 else 0

    subject = f"📊 电量日报 - {location}"

    body = f"""
【电量日报】

📍 位置：{location}
🔋 当前剩余电量：{balance:.2f} 度
📅 报告时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📈 预计可用：{estimated_days:.1f} 天（按日均 3 度估算）

✅ 电量充足，无需充值。

📋 近期提醒：
  • 低电量预警阈值：{config.get('alert', {}).get('low_power_threshold', 5.0)} 度
  • 检查频率：每 4 小时
  • 日报时间：每日 {report_hour}:00

—— 自动监控脚本
    """.strip()

    return send_email(config, subject, body)


# ================= 电量查询 =================

def query_power_balance(config: dict) -> tuple:
    """
    查询电量余额
    :return: (success: bool, balance: float or None, error_msg: str or None)
    """
    api_cfg = config.get("api", {})
    loc_cfg = config.get("location", {})

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Synjones-Auth": config.get("auth", {}).get("token", ""),
        "Origin": "https://mcard.sdu.edu.cn",
        "Referer": "https://mcard.sdu.edu.cn/",
        "Connection": "keep-alive",
    }

    data = {
        "type": api_cfg.get("type", "IEC"),
        "level": api_cfg.get("level", "3"),
        "feeitemid": api_cfg.get("feeitemid", "410"),
        "campus": loc_cfg.get("campus_param", ""),
        "building": loc_cfg.get("building_param", ""),
        "room": loc_cfg.get("room", ""),
    }

    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 正在查询电量...")

        response = requests.post(
            api_cfg.get("url", ""),
            headers=headers,
            data=data,
            timeout=api_cfg.get("timeout", 10),
            verify=True
        )

        if response.status_code != 200:
            return False, None, f"HTTP {response.status_code}: {response.text[:100]}"

        result = response.json()

        if result.get("code") != 200:
            return False, None, f"接口错误：code={result.get('code')}, msg={result.get('msg')}"

        info_text = result.get("map", {}).get("showData", {}).get("信息", "")

        if not info_text:
            return False, None, "响应中'信息'字段为空"

        # ✅ 使用配置指定的正则表达式
        match = re.search(r'([\d.]+)\s*度', info_text)

        if not match:
            return False, None, f"无法解析电量：'{info_text}'"

        balance = float(match.group(1))
        print(f"✓ 查询成功：当前电量 {balance} 度")
        return True, balance, None

    except requests.exceptions.RequestException as e:
        return False, None, f"网络异常：{type(e).__name__}: {str(e)[:100]}"
    except (json.JSONDecodeError, ValueError) as e:
        return False, None, f"解析异常：{type(e).__name__}: {str(e)[:100]}"
    except Exception as e:
        return False, None, f"未知错误：{type(e).__name__}: {str(e)[:100]}"


# ================= 主流程 =================

def main():
    """主函数"""
    # 1. 加载配置
    config = load_config("config.yaml")

    # 2. 初始化状态管理器
    paths = config.get("paths", {})
    state_file = Path(__file__).parent / paths.get("state_file", "power_alert_state.json")
    state = AlertState(state_file)
    state.set_config(config.get("alert", {}))

    # 3. 打印启动信息
    loc = config.get("location", {})
    alert_cfg = config.get("alert", {})
    print("=" * 70)
    print("🔋 宿舍低电费预警系统启动")
    print("=" * 70)
    print(f"📍 监控位置：{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}")
    print(f"🚨 低电量阈值：{alert_cfg.get('low_power_threshold', 5.0)} 度")
    print(f"📧 警告限制：最多 {alert_cfg.get('max_alert_count', 3)} 次/状态")
    print(f"📊 日报时间：每日 {alert_cfg.get('daily_report_hour', 8)}:00")
    print(f"📁 状态文件：{state_file}")
    print(f"📧 邮件通知：{'启用' if config.get('email', {}).get('enabled', True) else '禁用'}")
    print("=" * 70)

    # 4. 查询电量
    success, balance, error_msg = query_power_balance(config)

    max_count = alert_cfg.get("max_alert_count", 3)

    if not success:
        # ❌ 查询失败
        print(f"✗ 查询失败：{error_msg}")

        if state.can_send_error_alert():
            state.increment_error_alert()
            send_error_alert(config, error_msg, state.state["error_alert_count"], max_count)
        else:
            print(f"⚠️  已达到最大错误警告次数 ({max_count}), 跳过发送")

        return

    # ✅ 查询成功 - 重置错误计数
    state.reset_error_alert()
    state.update_success(balance)

    # 5. 判断电量状态
    threshold = alert_cfg.get("low_power_threshold", 5.0)

    if balance < threshold:
        # ⚠️ 低电量
        print(f"⚠️  警告：{balance:.2f} 度 < {threshold} 度")

        if state.can_send_low_power_alert():
            state.increment_low_power_alert()
            send_low_power_alert(config, balance, state.state["low_power_alert_count"], max_count)
        else:
            print(f"⚠️  已达到最大低电量警告次数 ({max_count}), 跳过发送")

    else:
        # ✅ 电量充足 - 重置低电量计数
        state.reset_low_power_alert()

        # 6. 检查是否需要发送日报
        if state.should_send_daily_report():
            print(f"📊 发送电量日报...")
            send_daily_report(config, balance)
            state.mark_daily_report_sent()
        else:
            print(f"✓ 电量充足 ({balance:.2f} 度)，今日日报已发送或未到时间")

    print("=" * 70)
    print(f"✅ 执行完成")
    print("=" * 70)


if __name__ == "__main__":
    main()