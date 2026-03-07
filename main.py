#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
低电费预警脚本
作者：OrangeHome&qwen
日期：2026 年 3月
"""

import re
import json
import smtplib
import requests
import os
import sys
import logging
from datetime import datetime
from json import JSONDecodeError
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ 缺少依赖：pyyaml")
    print("💡 请运行：pip3 install pyyaml")
    sys.exit(1)

# ================= 配置加载 =================

def validate_config(config):
    """校验配置结构和关键字段。"""
    if not isinstance(config, dict):
        raise ValueError("配置文件内容必须是 YAML 对象（键值对）")

    required_fields = [
        ("auth", "token"),
        ("api", "url"),
        ("location", "campus_param"),
        ("location", "building_param"),
        ("location", "room"),
    ]
    missing = []
    for section, key in required_fields:
        if not config.get(section, {}).get(key):
            missing.append(f"{section}.{key}")
    if missing:
        raise ValueError(f"缺少必填配置：{', '.join(missing)}")

    alert_cfg = config.get("alert", {})
    threshold = alert_cfg.get("low_power_threshold", 5.0)
    if not isinstance(threshold, (int, float)) or threshold <= 0:
        raise ValueError("alert.low_power_threshold 必须是大于 0 的数字")

    max_alert_count = alert_cfg.get("max_alert_count", 3)
    if not isinstance(max_alert_count, int) or max_alert_count < 1:
        raise ValueError("alert.max_alert_count 必须是大于等于 1 的整数")

    daily_report_hour = alert_cfg.get("daily_report_hour", 8)
    if not isinstance(daily_report_hour, int) or not 0 <= daily_report_hour <= 23:
        raise ValueError("alert.daily_report_hour 必须是 0-23 的整数")

    email_cfg = config.get("email", {})
    if email_cfg.get("enabled", True):
        email_required = ["smtp_server", "smtp_port", "sender_email", "sender_password", "receiver_email"]
        for key in email_required:
            if not email_cfg.get(key):
                raise ValueError(f"email.enabled=true 时必须配置 email.{key}")

    return config


def setup_logging(config):
    """初始化控制台 + 文件日志。"""
    log_rel_path = config.get("paths", {}).get("log_file", "power_alert.log")
    log_path = Path(__file__).parent / log_rel_path
    log_path.parent.mkdir(parents=True, exist_ok=True)

    handlers = [
        logging.StreamHandler(),
        logging.FileHandler(log_path, encoding="utf-8"),
    ]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
        force=True,
    )

def load_config(config_file="config.yaml"):
    """加载配置文件"""
    config_path = Path(__file__).parent / config_file
    if not config_path.exists():
        print(f"❌ 配置文件不存在：{config_path}")
        print(f"💡 请复制 config.example.yaml 为 {config_file} 并修改配置")
        sys.exit(1)
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        validate_config(config)
        print(f"✓ 配置文件加载成功：{config_path}")
        return config
    except yaml.YAMLError as e:
        print(f"❌ 配置文件解析失败：{e}")
        sys.exit(1)
    except ValueError as e:
        print(f"❌ 配置校验失败：{e}")
        sys.exit(1)
    except OSError as e:
        print(f"❌ 读取配置文件失败：{e}")
        sys.exit(1)

# ================= 状态管理 =================

class AlertState:
    """告警状态管理器（持久化到 JSON 文件）"""
    
    def __init__(self, state_file):
        self.state_file = state_file
        self.state = self._load_state()
        self.config = {}
    
    def _load_state(self):
        """加载状态文件"""
        default_state = {
            "low_power_alert_count": 0,
            "low_power_last_alert": None,
            "error_alert_count": 0,
            "error_last_alert": None,
            "last_daily_report": None,
            "last_success_time": None,
            "last_known_balance": None,
            "power_history": {},
        }
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    default_state.update(loaded)
            except (OSError, JSONDecodeError, TypeError) as e:
                print(f"⚠️  状态文件读取失败：{e}")
        else:
            print(f"ℹ️  状态文件不存在，将创建：{self.state_file}")
        return default_state
    
    def save(self):
        """保存状态到文件"""
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
            # 仅在类 Unix 系统上设置 600 权限，避免 Windows 误报保存失败。
            if os.name == "posix":
                try:
                    os.chmod(self.state_file, 0o600)
                except OSError as e:
                    print(f"⚠️  状态文件权限设置失败：{e}")
        except OSError as e:
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
    
    def can_send_low_power_alert(self):
        return self.state["low_power_alert_count"] < self.config.get("max_alert_count", 3)
    
    def increment_low_power_alert(self):
        self.state["low_power_alert_count"] += 1
        self.state["low_power_last_alert"] = datetime.now().isoformat()
        self.save()
        print(f"📊 低电量警告计数：{self.state['low_power_alert_count']}/{self.config.get('max_alert_count', 3)}")
    
    def can_send_error_alert(self):
        return self.state["error_alert_count"] < self.config.get("max_alert_count", 3)
    
    def increment_error_alert(self):
        self.state["error_alert_count"] += 1
        self.state["error_last_alert"] = datetime.now().isoformat()
        self.save()
        print(f"📊 错误警告计数：{self.state['error_alert_count']}/{self.config.get('max_alert_count', 3)}")
    
    def should_send_daily_report(self):
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
    
    def update_success(self, balance):
        self.state["last_success_time"] = datetime.now().isoformat()
        self.state["last_known_balance"] = balance
        self.save()
    
    def set_config(self, config):
        """设置配置引用"""
        self.config = config
    
    def record_power_history(self, balance, max_days=7):
        """
        记录电量历史（用于计算用电量）
        :param balance: 当前电量
        :param max_days: 最多保留天数
        """
        today = datetime.now().strftime("%Y-%m-%d")
        if "power_history" not in self.state:
            self.state["power_history"] = {}
        history = self.state["power_history"]
        if today in history:
            return
        history[today] = {
            "balance": balance,
            "recorded_at": datetime.now().isoformat()
        }
        dates = sorted(history.keys())
        if len(dates) > max_days:
            for old_date in dates[:-max_days]:
                del history[old_date]
        self.save()
        print(f"📈 已记录电量历史：{today} = {balance} 度")
    
    def get_yesterday_consumption(self):
        """
        计算昨日用电量
        :return: 用电量（度），如果数据不足返回 None
        """
        history = self.state.get("power_history", {})
        dates = sorted(history.keys(), reverse=True)
        if len(dates) < 2:
            return None
        yesterday = dates[0]
        day_before = dates[1]
        balance_yesterday = history[yesterday]["balance"]
        balance_day_before = history[day_before]["balance"]
        consumption = balance_day_before - balance_yesterday
        if consumption < 0:
            return None
        return round(consumption, 2)
    
    def get_average_daily_consumption(self, days=3):
        """
        计算过去 N 天的平均日用电量
        :param days: 计算天数
        :return: 平均用电量（度/天），如果数据不足返回 None
        """
        history = self.state.get("power_history", {})
        dates = sorted(history.keys(), reverse=True)
        if len(dates) < days + 1:
            return None
        consumptions = []
        for i in range(min(days, len(dates) - 1)):
            date_new = dates[i]
            date_old = dates[i + 1]
            balance_new = history[date_new]["balance"]
            balance_old = history[date_old]["balance"]
            consumption = balance_old - balance_new
            if consumption > 0:
                consumptions.append(consumption)
        if len(consumptions) < 2:
            return None
        avg = sum(consumptions) / len(consumptions)
        return round(avg, 2)

# ================= 邮件发送 =================

def send_email(config, subject, body):
    """发送邮件"""
    email_cfg = config.get("email", {})
    if not email_cfg.get("enabled", True):
        print("⚠️  邮件通知已禁用")
        return False
    if not all([email_cfg.get("sender_email"), email_cfg.get("sender_password"), email_cfg.get("receiver_email")]):
        print("⚠️  邮箱配置不完整")
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
        logging.info("✓ 邮件已发送")
        return True
    except (smtplib.SMTPException, OSError) as e:
        print(f"✗ 邮件发送异常：{e}")
        logging.error("邮件发送异常")
        return False

def send_low_power_alert(config, balance, alert_count, max_count):
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
📧 警告次数：{alert_count}/{max_count}

⚠️ 电量已低于安全阈值，请及时充值！

—— 自动监控脚本
    """.strip()
    return send_email(config, subject, body)

def send_error_alert(config, error_msg, alert_count, max_count):
    """发送请求失败警告邮件"""
    loc = config.get("location", {})
    location = f"{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}"
    subject = f"❌ 电量查询失败 [{alert_count}/{max_count}] - {location}"
    body = f"""
【查询异常通知】

📍 位置：{location}
❌ 错误信息：{error_msg}
⏰ 检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📧 警告次数：{alert_count}/{max_count}

⚠️ 请检查网络和 Token 是否有效。

—— 自动监控脚本
    """.strip()
    return send_email(config, subject, body)

def send_daily_report(config, balance, state):
    """发送电量日报（增强版：含昨日用电量 + 智能预估）"""
    loc = config.get("location", {})
    location = f"{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}"
    report_hour = config.get("alert", {}).get("daily_report_hour", 8)
    threshold = config.get("alert", {}).get("low_power_threshold", 5.0)
    
    # 📊 计算用电数据
    yesterday_consumption = state.get_yesterday_consumption()
    avg_consumption = state.get_average_daily_consumption(days=3)
    
    # 📈 预计可用天数（优先使用 3 天平均，其次昨日，最后默认值）
    if avg_consumption and avg_consumption > 0:
        estimated_days = balance / avg_consumption
        consumption_note = f"（按近 3 天平均 {avg_consumption} 度/天估算）"
    elif yesterday_consumption and yesterday_consumption > 0:
        estimated_days = balance / yesterday_consumption
        consumption_note = f"（按昨日 {yesterday_consumption} 度估算）"
    else:
        estimated_days = balance / 3.0
        consumption_note = "（按默认 3 度/天估算，数据积累后将更准确）"
    
    # 📝 构建日报内容
    report_lines = [
        "【电量日报】",
        "",
        f"📍 位置：{location}",
        f"🔋 当前剩余电量：{balance:.2f} 度",
        f"📅 报告时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    ]
    
    if yesterday_consumption is not None:
        report_lines.append(f"📉 昨日用电量：{yesterday_consumption:.2f} 度")
    else:
        report_lines.append("📉 昨日用电量：数据积累中...")
    
    if avg_consumption:
        report_lines.append(f"📊 近 3 天平均：{avg_consumption:.2f} 度/天")
    
    report_lines.extend([
        f"📈 预计可用：{estimated_days:.1f} 天 {consumption_note}",
        "",
    ])
    
    if balance < threshold * 2:
        report_lines.append(f"⚠️  电量偏低，建议关注（阈值：{threshold} 度）")
    else:
        report_lines.append("✅ 电量充足，无需充值。")
    
    report_lines.extend([
        "",
        "📋 近期提醒：",
        f"  • 低电量预警阈值：{threshold} 度",
        "  • 检查频率：每 4 小时",
        f"  • 日报时间：每日 {report_hour}:00",
        "",
        "—— 自动监控脚本",
    ])
    
    subject = f"📊 电量日报 - {location}"
    body = "\n".join(report_lines)
    
    return send_email(config, subject, body)

# ================= 电量查询 =================

def query_power_balance(config):
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
        response = requests.post(api_cfg.get("url", ""), headers=headers, data=data, timeout=api_cfg.get("timeout", 10), verify=True)
        if response.status_code != 200:
            return False, None, f"HTTP {response.status_code}"
        result = response.json()
        if result.get("code") != 200:
            return False, None, f"接口错误：code={result.get('code')}"
        info_text = result.get("map", {}).get("showData", {}).get("信息", "")
        if not info_text:
            return False, None, "信息字段为空"
        match = re.search(r'([\d.]+)\s*度', info_text)
        if not match:
            return False, None, f"无法解析电量：'{info_text}'"
        balance = float(match.group(1))
        print(f"✓ 查询成功：当前电量 {balance} 度")
        return True, balance, None
    except requests.RequestException as e:
        return False, None, f"网络异常：{type(e).__name__}: {str(e)[:100]}"
    except (ValueError, JSONDecodeError) as e:
        return False, None, f"响应解析异常：{type(e).__name__}: {str(e)[:100]}"
    except OSError as e:
        return False, None, f"异常：{type(e).__name__}: {str(e)[:100]}"

# ================= 主流程 =================

def main():
    """主函数"""
    config = load_config("config.yaml")
    setup_logging(config)
    paths = config.get("paths", {})
    state_file = Path(__file__).parent / paths.get("state_file", "power_alert_state.json")
    state = AlertState(state_file)
    state.set_config(config.get("alert", {}))
    loc = config.get("location", {})
    alert_cfg = config.get("alert", {})
    history_cfg = alert_cfg.get("history", {})
    max_history_days = history_cfg.get("max_days", 7)
    
    print("=" * 70)
    print("🔋 低电费预警系统启动")
    print("=" * 70)
    print(f"📍 监控位置：{loc.get('campus', '')} {loc.get('building', '')} {loc.get('room', '')}")
    print(f"🚨 低电量阈值：{alert_cfg.get('low_power_threshold', 5.0)} 度")
    print(f"📧 警告限制：最多 {alert_cfg.get('max_alert_count', 3)} 次/状态")
    print(f"📊 日报时间：每日 {alert_cfg.get('daily_report_hour', 8)}:00")
    print(f"📈 用电统计：近{history_cfg.get('average_days', 3)}天平均")
    print("=" * 70)
    logging.info("系统启动，监控位置=%s %s %s", loc.get('campus', ''), loc.get('building', ''), loc.get('room', ''))
    success, balance, error_msg = query_power_balance(config)
    max_count = alert_cfg.get("max_alert_count", 3)
    
    if not success:
        print(f"✗ 查询失败：{error_msg}")
        logging.error("查询失败：%s", error_msg)
        if state.can_send_error_alert():
            state.increment_error_alert()
            send_error_alert(config, error_msg, state.state["error_alert_count"], max_count)
        else:
            print(f"⚠️  已达到最大错误警告次数 ({max_count})")
            logging.warning("已达到最大错误警告次数 (%s)", max_count)
        return
    
    state.reset_error_alert()
    state.update_success(balance)
    state.record_power_history(balance, max_days=max_history_days)
    
    threshold = alert_cfg.get("low_power_threshold", 5.0)
    
    if balance < threshold:
        print(f"⚠️  警告：{balance:.2f} 度 < {threshold} 度")
        logging.warning("电量低于阈值：%.2f < %.2f", balance, threshold)
        if state.can_send_low_power_alert():
            state.increment_low_power_alert()
            send_low_power_alert(config, balance, state.state["low_power_alert_count"], max_count)
        else:
            print(f"⚠️  已达到最大低电量警告次数 ({max_count})")
            logging.warning("已达到最大低电量警告次数 (%s)", max_count)
    else:
        state.reset_low_power_alert()
        if state.should_send_daily_report():
            print(f"📊 发送电量日报...")
            logging.info("发送电量日报")
            send_daily_report(config, balance, state)
            state.mark_daily_report_sent()
        else:
            print(f"✓ 电量充足 ({balance:.2f} 度)")
            logging.info("电量充足：%.2f 度", balance)
    
    print("=" * 70)
    print(f"✅ 执行完成")
    logging.info("本轮执行完成")
    print("=" * 70)

if __name__ == "__main__":
    main()