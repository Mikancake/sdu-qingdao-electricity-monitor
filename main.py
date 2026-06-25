#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
低电费预警脚本
作者：OrangeHome&qwen
日期：2026 年 3月
"""

import argparse
import csv
import json
import logging
import os
import random
import re
import sqlite3
import smtplib
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

import requests

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass

try:
    import yaml
except ImportError:
    print("❌ 缺少依赖：pyyaml")
    print("💡 请运行：pip3 install pyyaml")
    sys.exit(1)


BASE_DIR = Path(__file__).resolve().parent


# ================= 配置模型 =================

@dataclass
class RoomConfig:
    """单个宿舍的监控配置。"""

    id: str
    campus: str
    campus_param: str
    building: str
    building_param: str
    room: str
    receivers: List[str]
    enabled: bool = True
    check_interval_minutes: Optional[int] = None
    low_power_threshold: Optional[float] = None

    @property
    def location_label(self) -> str:
        return f"{self.campus} {self.building} {self.room}".strip()


@dataclass
class TokenConfig:
    """一个可用于查询电量的认证 token。"""

    id: str
    value: str
    enabled: bool = True
    min_interval_seconds: int = 10
    cooldown_seconds: int = 300


@dataclass
class AppConfig:
    """加载并标准化后的运行配置。"""

    raw: Dict
    config_path: Path
    api: Dict
    email: Dict
    check: Dict
    notify: Dict
    paths: Dict
    rooms: List[RoomConfig]
    tokens: List[TokenConfig]


@dataclass
class QueryResult:
    success: bool
    balance: Optional[float] = None
    error_msg: Optional[str] = None
    error_kind: str = "unknown"


def as_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def parse_receivers(value) -> List[str]:
    """支持列表、逗号分隔和分号分隔的收件人格式。"""
    if not value:
        return []
    if isinstance(value, str):
        parts = re.split(r"[;,]", value)
    elif isinstance(value, Iterable):
        parts = []
        for item in value:
            parts.extend(re.split(r"[;,]", str(item)))
    else:
        parts = [str(value)]
    return [item.strip() for item in parts if item and item.strip()]


def param_display_name(param: str) -> str:
    if not param:
        return ""
    if "&" in param:
        return param.split("&", 1)[1]
    return param


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def format_datetime(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat(sep=" ")


def resolve_path(base: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return base / path


def normalize_int(value, default: int, minimum: Optional[int] = None) -> int:
    if value is None or value == "":
        result = default
    else:
        result = int(value)
    if minimum is not None and result < minimum:
        raise ValueError(f"配置值必须 >= {minimum}")
    return result


def normalize_float(value, default: float, minimum: Optional[float] = None) -> float:
    if value is None or value == "":
        result = default
    else:
        result = float(value)
    if minimum is not None and result < minimum:
        raise ValueError(f"配置值必须 >= {minimum}")
    return result


def read_records_file(config_path: Path, file_value: str, root_key: str) -> List[Dict]:
    """读取 YAML/JSON/CSV 列表配置文件。"""
    records_path = resolve_path(config_path.parent, file_value)
    if not records_path.exists():
        raise ValueError(f"{root_key}_file 不存在：{records_path}")

    suffix = records_path.suffix.lower()
    if suffix == ".csv":
        with open(records_path, "r", encoding="utf-8-sig", newline="") as f:
            return [dict(row) for row in csv.DictReader(f)]

    with open(records_path, "r", encoding="utf-8") as f:
        if suffix == ".json":
            data = json.load(f)
        else:
            data = yaml.safe_load(f)

    if isinstance(data, dict):
        data = data.get(root_key) or data.get(f"{root_key}s") or data.get("items") or data.get("data")
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValueError(f"{records_path} 必须是列表，或包含 {root_key}/{root_key}s 列表")
    return data


def read_rooms_csv(config_path: Path, rooms_file: str) -> List[Dict]:
    csv_path = resolve_path(config_path.parent, rooms_file)
    if not csv_path.exists():
        raise ValueError(f"rooms_file 不存在：{csv_path}")
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        return [dict(row) for row in csv.DictReader(f)]


def load_tokens(raw: Dict, config_path: Path) -> List[TokenConfig]:
    token_entries = raw.get("tokens")
    if raw.get("tokens_file"):
        token_entries = read_records_file(config_path, raw["tokens_file"], "token")

    if token_entries is None:
        token_entries = raw.get("auth", {}).get("tokens")

    if token_entries is None:
        legacy_token = raw.get("auth", {}).get("token")
        if legacy_token:
            token_entries = [{"id": "default", "value": legacy_token}]

    if isinstance(token_entries, dict):
        token_entries = [
            {"id": token_id, **(token_cfg if isinstance(token_cfg, dict) else {"value": token_cfg})}
            for token_id, token_cfg in token_entries.items()
        ]

    tokens: List[TokenConfig] = []
    for index, item in enumerate(token_entries or [], start=1):
        if not isinstance(item, dict):
            item = {"value": item}
        value = str(item.get("value") or item.get("token") or "").strip()
        if not value:
            continue
        token_id = str(item.get("id") or f"token_{index}").strip()
        tokens.append(
            TokenConfig(
                id=token_id,
                value=value,
                enabled=as_bool(item.get("enabled"), True),
                min_interval_seconds=normalize_int(item.get("min_interval_seconds"), 10, minimum=0),
                cooldown_seconds=normalize_int(item.get("cooldown_seconds"), 300, minimum=0),
            )
        )
    return tokens


def normalize_room(raw_room: Dict, raw_config: Dict, index: int) -> RoomConfig:
    building_params = raw_config.get("building_params") or raw_config.get("buildings") or {}
    campus_param = raw_room.get("campus_param") or raw_config.get("campus_param") or "青岛校区&青岛校区"
    campus = raw_room.get("campus") or param_display_name(campus_param) or "青岛校区"

    building_param = raw_room.get("building_param")
    building_key = raw_room.get("building_key")
    if not building_param and building_key:
        try:
            building_param = building_params[building_key]
        except KeyError as exc:
            raise ValueError(f"rooms[{index}].building_key 未在 building_params 中定义：{building_key}") from exc
    building = raw_room.get("building") or param_display_name(building_param)
    room_no = str(raw_room.get("room") or raw_room.get("room_number") or "").strip()
    if not building_param:
        raise ValueError(f"rooms[{index}] 缺少 building_param 或 building_key")
    if not room_no:
        raise ValueError(f"rooms[{index}] 缺少 room")

    receivers = parse_receivers(raw_room.get("receivers") or raw_room.get("receiver_email") or raw_room.get("receiver"))
    room_id = str(raw_room.get("id") or f"{building}-{room_no}").strip()
    return RoomConfig(
        id=room_id,
        campus=str(campus).strip(),
        campus_param=str(campus_param).strip(),
        building=str(building).strip(),
        building_param=str(building_param).strip(),
        room=room_no,
        receivers=receivers,
        enabled=as_bool(raw_room.get("enabled"), True),
        check_interval_minutes=(
            normalize_int(raw_room.get("check_interval_minutes"), 0, minimum=0)
            if raw_room.get("check_interval_minutes") not in (None, "")
            else None
        ),
        low_power_threshold=(
            normalize_float(raw_room.get("low_power_threshold"), 0.0, minimum=0.0)
            if raw_room.get("low_power_threshold") not in (None, "")
            else None
        ),
    )


def load_rooms(raw: Dict, config_path: Path) -> List[RoomConfig]:
    room_entries: List[Dict] = []
    if raw.get("rooms_file"):
        room_entries.extend(read_records_file(config_path, raw["rooms_file"], "room"))

    rooms = raw.get("rooms")
    if isinstance(rooms, dict):
        room_entries.extend(
            {"id": room_id, **(room_cfg if isinstance(room_cfg, dict) else {})}
            for room_id, room_cfg in rooms.items()
        )
    elif isinstance(rooms, list):
        room_entries.extend(rooms)

    if not room_entries:
        loc = raw.get("location", {})
        if loc:
            room_entries = [
                {
                    "id": loc.get("id") or "default",
                    "campus": loc.get("campus"),
                    "campus_param": loc.get("campus_param"),
                    "building": loc.get("building"),
                    "building_param": loc.get("building_param"),
                    "room": loc.get("room"),
                    "receivers": raw.get("email", {}).get("receiver_email"),
                }
            ]

    rooms_config = [normalize_room(room, raw, idx) for idx, room in enumerate(room_entries)]
    seen = set()
    for room in rooms_config:
        if room.id in seen:
            raise ValueError(f"宿舍 id 重复：{room.id}")
        seen.add(room.id)
    return rooms_config


def build_app_config(raw: Dict, config_path: Path) -> AppConfig:
    if not isinstance(raw, dict):
        raise ValueError("配置文件内容必须是 YAML 对象（键值对）")

    api_cfg = dict(raw.get("api", {}))
    api_cfg.setdefault("url", "https://mcard.sdu.edu.cn/charge/feeitem/getThirdData")
    api_cfg.setdefault("type", "IEC")
    api_cfg.setdefault("level", "3")
    api_cfg.setdefault("feeitemid", "410")
    api_cfg.setdefault("timeout", 10)
    if not api_cfg.get("url"):
        raise ValueError("缺少必填配置：api.url")

    email_cfg = dict(raw.get("email", {}))
    email_cfg.setdefault("enabled", True)
    if email_cfg.get("enabled", True):
        for key in ["smtp_server", "smtp_port", "sender_email", "sender_password"]:
            if not email_cfg.get(key):
                raise ValueError(f"email.enabled=true 时必须配置 email.{key}")

    alert_cfg = raw.get("alert", {})
    notify_cfg = dict(raw.get("notify", {}))
    notify_cfg.setdefault("low_power_threshold", alert_cfg.get("low_power_threshold", 5.0))
    notify_cfg.setdefault("max_alert_count", alert_cfg.get("max_alert_count", 3))
    notify_cfg.setdefault("max_error_alert_count", notify_cfg.get("max_alert_count", 3))
    notify_cfg.setdefault("daily_report_hour", alert_cfg.get("daily_report_hour", 8))
    notify_cfg.setdefault("send_batch_size", 50)
    notify_cfg.setdefault("retry_delay_minutes", 15)
    notify_cfg.setdefault("max_send_attempts", 3)

    if normalize_float(notify_cfg.get("low_power_threshold"), 5.0, minimum=0.01) <= 0:
        raise ValueError("notify.low_power_threshold 必须是大于 0 的数字")
    if not 0 <= normalize_int(notify_cfg.get("daily_report_hour"), 8, minimum=0) <= 23:
        raise ValueError("notify.daily_report_hour 必须是 0-23 的整数")

    check_cfg = dict(raw.get("check", {}))
    check_cfg.setdefault("default_interval_minutes", 240)
    check_cfg.setdefault("batch_size", 20)
    check_cfg.setdefault("request_interval_seconds", 3)
    check_cfg.setdefault("jitter_seconds", 60)
    check_cfg.setdefault("retry_delay_minutes", 30)
    check_cfg["default_interval_minutes"] = normalize_int(check_cfg["default_interval_minutes"], 240, minimum=1)
    check_cfg["batch_size"] = normalize_int(check_cfg["batch_size"], 20, minimum=1)
    check_cfg["request_interval_seconds"] = normalize_float(check_cfg["request_interval_seconds"], 3.0, minimum=0.0)
    check_cfg["jitter_seconds"] = normalize_int(check_cfg["jitter_seconds"], 60, minimum=0)
    check_cfg["retry_delay_minutes"] = normalize_int(check_cfg["retry_delay_minutes"], 30, minimum=1)

    paths_cfg = dict(raw.get("paths", {}))
    paths_cfg.setdefault("state_db", "power_monitor.sqlite3")
    paths_cfg.setdefault("log_file", "power_alert.log")

    tokens = load_tokens(raw, config_path)
    if not tokens:
        raise ValueError("至少需要配置一个 token：tokens[].value 或 auth.token")
    if not any(token.enabled for token in tokens):
        raise ValueError("至少需要启用一个 token")

    rooms = load_rooms(raw, config_path)
    if not rooms:
        raise ValueError("至少需要配置一个宿舍：rooms 或 rooms_file")
    if not any(room.enabled for room in rooms):
        raise ValueError("至少需要启用一个宿舍")

    return AppConfig(
        raw=raw,
        config_path=config_path,
        api=api_cfg,
        email=email_cfg,
        check=check_cfg,
        notify=notify_cfg,
        paths=paths_cfg,
        rooms=rooms,
        tokens=tokens,
    )


def load_config(config_file="config.yaml") -> AppConfig:
    """加载配置文件并转换成运行时配置。"""
    config_path = resolve_path(BASE_DIR, config_file)
    if not config_path.exists():
        print(f"❌ 配置文件不存在：{config_path}")
        print(f"💡 请复制 config.example.yaml 为 {config_path.name} 并修改配置")
        sys.exit(1)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        app_config = build_app_config(raw, config_path)
        print(f"✓ 配置文件加载成功：{config_path}")
        return app_config
    except yaml.YAMLError as e:
        print(f"❌ 配置文件解析失败：{e}")
        sys.exit(1)
    except ValueError as e:
        print(f"❌ 配置校验失败：{e}")
        sys.exit(1)
    except OSError as e:
        print(f"❌ 读取配置文件失败：{e}")
        sys.exit(1)


def setup_logging(config: AppConfig):
    """初始化控制台 + 文件日志。"""
    log_path = resolve_path(BASE_DIR, config.paths.get("log_file", "power_alert.log"))
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


# ================= SQLite 状态管理 =================

class MonitorStore:
    """使用 SQLite 保存宿舍状态、token 运行状态、电量历史和待发送通知。"""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def close(self):
        self.conn.close()

    def _init_schema(self):
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS room_state (
                room_id TEXT PRIMARY KEY,
                next_check_at TEXT,
                last_checked_at TEXT,
                last_success_at TEXT,
                last_balance REAL,
                low_power_alert_count INTEGER NOT NULL DEFAULT 0,
                low_power_last_alert TEXT,
                error_alert_count INTEGER NOT NULL DEFAULT 0,
                error_last_alert TEXT,
                last_daily_report_date TEXT,
                last_error TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT NOT NULL,
                balance REAL NOT NULL,
                checked_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_readings_room_time
                ON readings (room_id, checked_at DESC);

            CREATE TABLE IF NOT EXISTS token_state (
                token_id TEXT PRIMARY KEY,
                last_used_at TEXT,
                failure_count INTEGER NOT NULL DEFAULT 0,
                cooldown_until TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS notification_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT NOT NULL,
                type TEXT NOT NULL,
                recipients_json TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                due_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                sent_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_notification_status_due
                ON notification_queue (status, due_at);
            """
        )
        self.conn.commit()

    def ensure_rooms(self, rooms: Sequence[RoomConfig], now: datetime):
        for room in rooms:
            self.conn.execute(
                """
                INSERT OR IGNORE INTO room_state (room_id, next_check_at, updated_at)
                VALUES (?, ?, ?)
                """,
                (room.id, format_datetime(now), format_datetime(now)),
            )
        self.conn.commit()

    def get_room_state(self, room_id: str) -> Dict:
        row = self.conn.execute("SELECT * FROM room_state WHERE room_id = ?", (room_id,)).fetchone()
        if row:
            return dict(row)
        return {
            "room_id": room_id,
            "next_check_at": None,
            "last_checked_at": None,
            "last_success_at": None,
            "last_balance": None,
            "low_power_alert_count": 0,
            "error_alert_count": 0,
            "last_daily_report_date": None,
        }

    def get_due_room_ids(self, enabled_room_ids: set, now: datetime, limit: int) -> List[str]:
        rows = self.conn.execute(
            """
            SELECT room_id
            FROM room_state
            WHERE next_check_at IS NULL OR next_check_at <= ?
            ORDER BY COALESCE(next_check_at, '1970-01-01 00:00:00') ASC
            LIMIT ?
            """,
            (format_datetime(now), max(limit * 5, limit)),
        ).fetchall()
        due = [row["room_id"] for row in rows if row["room_id"] in enabled_room_ids]
        return due[:limit]

    def record_success(self, room_id: str, balance: float, checked_at: datetime, next_check_at: datetime, max_history_days: int):
        checked_at_text = format_datetime(checked_at)
        self.conn.execute(
            """
            UPDATE room_state
            SET next_check_at = ?, last_checked_at = ?, last_success_at = ?,
                last_balance = ?, last_error = NULL, updated_at = ?
            WHERE room_id = ?
            """,
            (format_datetime(next_check_at), checked_at_text, checked_at_text, balance, checked_at_text, room_id),
        )
        self.conn.execute(
            "INSERT INTO readings (room_id, balance, checked_at) VALUES (?, ?, ?)",
            (room_id, balance, checked_at_text),
        )
        cutoff = checked_at - timedelta(days=max_history_days)
        self.conn.execute(
            "DELETE FROM readings WHERE room_id = ? AND checked_at < ?",
            (room_id, format_datetime(cutoff)),
        )
        self.conn.commit()

    def record_failure(self, room_id: str, error_msg: str, checked_at: datetime, next_check_at: datetime):
        self.conn.execute(
            """
            UPDATE room_state
            SET next_check_at = ?, last_checked_at = ?, last_error = ?, updated_at = ?
            WHERE room_id = ?
            """,
            (format_datetime(next_check_at), format_datetime(checked_at), error_msg, format_datetime(checked_at), room_id),
        )
        self.conn.commit()

    def reset_low_power_alert(self, room_id: str):
        self.conn.execute(
            """
            UPDATE room_state
            SET low_power_alert_count = 0, low_power_last_alert = NULL, updated_at = ?
            WHERE room_id = ?
            """,
            (format_datetime(datetime.now()), room_id),
        )
        self.conn.commit()

    def increment_low_power_alert(self, room_id: str, now: datetime) -> int:
        state = self.get_room_state(room_id)
        new_count = int(state.get("low_power_alert_count") or 0) + 1
        self.conn.execute(
            """
            UPDATE room_state
            SET low_power_alert_count = ?, low_power_last_alert = ?, updated_at = ?
            WHERE room_id = ?
            """,
            (new_count, format_datetime(now), format_datetime(now), room_id),
        )
        self.conn.commit()
        return new_count

    def reset_error_alert(self, room_id: str):
        self.conn.execute(
            """
            UPDATE room_state
            SET error_alert_count = 0, error_last_alert = NULL, updated_at = ?
            WHERE room_id = ?
            """,
            (format_datetime(datetime.now()), room_id),
        )
        self.conn.commit()

    def increment_error_alert(self, room_id: str, now: datetime) -> int:
        state = self.get_room_state(room_id)
        new_count = int(state.get("error_alert_count") or 0) + 1
        self.conn.execute(
            """
            UPDATE room_state
            SET error_alert_count = ?, error_last_alert = ?, updated_at = ?
            WHERE room_id = ?
            """,
            (new_count, format_datetime(now), format_datetime(now), room_id),
        )
        self.conn.commit()
        return new_count

    def get_token_state(self, token_id: str) -> Dict:
        row = self.conn.execute("SELECT * FROM token_state WHERE token_id = ?", (token_id,)).fetchone()
        if row:
            return dict(row)
        return {"token_id": token_id, "last_used_at": None, "failure_count": 0, "cooldown_until": None}

    def mark_token_used(self, token_id: str, now: datetime):
        state = self.get_token_state(token_id)
        self.conn.execute(
            """
            INSERT OR REPLACE INTO token_state
                (token_id, last_used_at, failure_count, cooldown_until, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                token_id,
                format_datetime(now),
                int(state.get("failure_count") or 0),
                state.get("cooldown_until"),
                format_datetime(now),
            ),
        )
        self.conn.commit()

    def record_token_success(self, token_id: str, now: datetime):
        state = self.get_token_state(token_id)
        self.conn.execute(
            """
            INSERT OR REPLACE INTO token_state
                (token_id, last_used_at, failure_count, cooldown_until, updated_at)
            VALUES (?, ?, 0, NULL, ?)
            """,
            (token_id, state.get("last_used_at"), format_datetime(now)),
        )
        self.conn.commit()

    def record_token_failure(self, token_id: str, now: datetime, cooldown_seconds: int):
        state = self.get_token_state(token_id)
        failure_count = int(state.get("failure_count") or 0) + 1
        cooldown_until = now + timedelta(seconds=cooldown_seconds)
        self.conn.execute(
            """
            INSERT OR REPLACE INTO token_state
                (token_id, last_used_at, failure_count, cooldown_until, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                token_id,
                state.get("last_used_at"),
                failure_count,
                format_datetime(cooldown_until),
                format_datetime(now),
            ),
        )
        self.conn.commit()

    def enqueue_notification(
        self,
        room_id: str,
        notice_type: str,
        recipients: Sequence[str],
        subject: str,
        body: str,
        due_at: datetime,
    ):
        now_text = format_datetime(datetime.now())
        self.conn.execute(
            """
            INSERT INTO notification_queue
                (room_id, type, recipients_json, subject, body, due_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                room_id,
                notice_type,
                json.dumps(list(recipients), ensure_ascii=False),
                subject,
                body,
                format_datetime(due_at),
                now_text,
            ),
        )
        self.conn.commit()

    def get_pending_notifications(self, now: datetime, limit: int) -> List[Dict]:
        rows = self.conn.execute(
            """
            SELECT *
            FROM notification_queue
            WHERE status = 'pending' AND due_at <= ?
            ORDER BY due_at ASC, id ASC
            LIMIT ?
            """,
            (format_datetime(now), limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def mark_notification_sent(self, notice_id: int, now: datetime):
        self.conn.execute(
            """
            UPDATE notification_queue
            SET status = 'sent', sent_at = ?
            WHERE id = ?
            """,
            (format_datetime(now), notice_id),
        )
        self.conn.commit()

    def mark_notification_failed(self, notice_id: int, error_msg: str, due_at: datetime, final: bool):
        status = "failed" if final else "pending"
        self.conn.execute(
            """
            UPDATE notification_queue
            SET status = ?, attempts = attempts + 1, last_error = ?, due_at = ?
            WHERE id = ?
            """,
            (status, error_msg, format_datetime(due_at), notice_id),
        )
        self.conn.commit()

    def get_daily_balances(self, room_id: str, days: int = 7) -> Dict[str, float]:
        rows = self.conn.execute(
            """
            SELECT checked_at, balance
            FROM readings
            WHERE room_id = ?
            ORDER BY checked_at DESC
            """,
            (room_id,),
        ).fetchall()
        daily: Dict[str, float] = {}
        for row in rows:
            day = row["checked_at"][:10]
            if day not in daily:
                daily[day] = row["balance"]
            if len(daily) >= days:
                break
        return daily

    def mark_daily_report_queued(self, room_id: str, date_text: str, now: datetime):
        self.conn.execute(
            """
            UPDATE room_state
            SET last_daily_report_date = ?, updated_at = ?
            WHERE room_id = ?
            """,
            (date_text, format_datetime(now), room_id),
        )
        self.conn.commit()


# ================= 邮件与内容生成 =================

def send_email(email_cfg: Dict, recipients: Sequence[str], subject: str, body: str) -> bool:
    """使用固定发件邮箱发送邮件给当前宿舍的接收人。"""
    if not email_cfg.get("enabled", True):
        print("⚠️  邮件通知已禁用")
        return False
    recipients = [addr for addr in recipients if addr]
    if not recipients:
        print("⚠️  收件人为空，跳过邮件")
        return False

    max_attempts = normalize_int(email_cfg.get("send_retries"), 2, minimum=0) + 1
    retry_delay = normalize_float(email_cfg.get("retry_delay_seconds"), 3.0, minimum=0.0)
    last_error = None

    for attempt in range(1, max_attempts + 1):
        server = None
        try:
            message = MIMEMultipart()
            message["From"] = email_cfg["sender_email"]
            message["To"] = ", ".join(recipients)
            message["Subject"] = subject
            message.attach(MIMEText(body, "plain", "utf-8"))

            if email_cfg.get("use_ssl", True):
                server = smtplib.SMTP_SSL(email_cfg["smtp_server"], email_cfg["smtp_port"], timeout=10)
            else:
                server = smtplib.SMTP(email_cfg["smtp_server"], email_cfg["smtp_port"], timeout=10)
                server.starttls()
            server.login(email_cfg["sender_email"], email_cfg["sender_password"])
            server.sendmail(email_cfg["sender_email"], list(recipients), message.as_string())
            print(f"✓ 邮件已发送至：{', '.join(recipients)}")
            logging.info("邮件已发送：%s", ", ".join(recipients))
            return True
        except (smtplib.SMTPException, OSError) as e:
            last_error = e
            if attempt < max_attempts:
                print(f"⚠️  邮件发送异常，{retry_delay:g} 秒后重试 ({attempt}/{max_attempts})：{e}")
                logging.warning("邮件发送异常，准备重试 (%s/%s)：%s", attempt, max_attempts, e)
                if retry_delay > 0:
                    time.sleep(retry_delay)
            else:
                print(f"✗ 邮件发送异常：{e}")
                logging.error("邮件发送异常：%s", e)
        finally:
            if server is not None:
                try:
                    server.quit()
                except (smtplib.SMTPException, OSError):
                    pass

    return False


def calculate_consumption(store: MonitorStore, room_id: str, average_days: int = 3):
    daily = store.get_daily_balances(room_id, days=max(average_days + 1, 2))
    dates = sorted(daily.keys(), reverse=True)
    yesterday_consumption = None
    average_consumption = None
    if len(dates) >= 2:
        yesterday_consumption = daily[dates[1]] - daily[dates[0]]
        if yesterday_consumption < 0:
            yesterday_consumption = None
    consumptions = []
    for index in range(min(average_days, len(dates) - 1)):
        consumption = daily[dates[index + 1]] - daily[dates[index]]
        if consumption > 0:
            consumptions.append(consumption)
    if len(consumptions) >= 2:
        average_consumption = round(sum(consumptions) / len(consumptions), 2)
    if yesterday_consumption is not None:
        yesterday_consumption = round(yesterday_consumption, 2)
    return yesterday_consumption, average_consumption


def build_low_power_notice(room: RoomConfig, balance: float, threshold: float, alert_count: int, max_count: int):
    subject = f"⚠️ 低电量预警 [{alert_count}/{max_count}] - {room.location_label}"
    body = f"""
【低电费预警通知】

📍 位置：{room.location_label}
🔋 当前剩余电量：{balance:.2f} 度
🚨 预警阈值：{threshold} 度
⏰ 检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📧 警告次数：{alert_count}/{max_count}

⚠️ 电量已低于安全阈值，请及时充值！

—— 自动监控脚本
    """.strip()
    return subject, body


def build_error_notice(room: RoomConfig, error_msg: str, alert_count: int, max_count: int):
    subject = f"❌ 电量查询失败 [{alert_count}/{max_count}] - {room.location_label}"
    body = f"""
【查询异常通知】

📍 位置：{room.location_label}
❌ 错误信息：{error_msg}
⏰ 检测时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
📧 警告次数：{alert_count}/{max_count}

⚠️ 请检查网络、Token 和宿舍参数是否有效。

—— 自动监控脚本
    """.strip()
    return subject, body


def build_daily_report(config: AppConfig, store: MonitorStore, room: RoomConfig, balance: float):
    report_hour = normalize_int(config.notify.get("daily_report_hour"), 8, minimum=0)
    threshold = room.low_power_threshold or normalize_float(config.notify.get("low_power_threshold"), 5.0, minimum=0.01)
    average_days = normalize_int(config.notify.get("average_days"), 3, minimum=1)
    yesterday_consumption, avg_consumption = calculate_consumption(store, room.id, average_days=average_days)

    if avg_consumption and avg_consumption > 0:
        estimated_days = balance / avg_consumption
        consumption_note = f"（按近 {average_days} 天平均 {avg_consumption} 度/天估算）"
    elif yesterday_consumption and yesterday_consumption > 0:
        estimated_days = balance / yesterday_consumption
        consumption_note = f"（按昨日 {yesterday_consumption} 度估算）"
    else:
        estimated_days = balance / 3.0
        consumption_note = "（按默认 3 度/天估算，数据积累后将更准确）"

    lines = [
        "【电量日报】",
        "",
        f"📍 位置：{room.location_label}",
        f"🔋 当前剩余电量：{balance:.2f} 度",
        f"📅 报告时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    ]
    if yesterday_consumption is not None:
        lines.append(f"📉 昨日用电量：{yesterday_consumption:.2f} 度")
    else:
        lines.append("📉 昨日用电量：数据积累中...")
    if avg_consumption:
        lines.append(f"📊 近 {average_days} 天平均：{avg_consumption:.2f} 度/天")
    lines.extend(
        [
            f"📈 预计可用：{estimated_days:.1f} 天 {consumption_note}",
            "",
            f"📋 低电量预警阈值：{threshold} 度",
            f"📋 日报时间：每日 {report_hour}:00",
            "",
        ]
    )
    if balance < threshold * 2:
        lines.append(f"⚠️  电量偏低，建议关注（阈值：{threshold} 度）")
    else:
        lines.append("✅ 电量充足，无需充值。")
    lines.extend(["", "—— 自动监控脚本"])
    return f"📊 电量日报 - {room.location_label}", "\n".join(lines)


def build_test_email_notice(config: AppConfig, room: RoomConfig, balance: Optional[float], error_msg: Optional[str]):
    """生成即时测试邮件，明确标记为测试。"""
    threshold = room.low_power_threshold or normalize_float(config.notify.get("low_power_threshold"), 5.0, minimum=0.01)
    subject = f"【测试】电量监控测试邮件 - {room.location_label}"
    lines = [
        "【测试邮件】",
        "",
        "这是一封手动触发的测试邮件，用于验证 token 查询和 SMTP 发信配置。",
        "它不会计入正式低电量告警次数，也不会写入通知队列。",
        "",
        f"📍 位置：{room.location_label}",
        f"🚨 预警阈值：{threshold} 度",
        f"⏰ 测试时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    ]
    if balance is not None:
        lines.append(f"🔋 当前剩余电量：{balance:.2f} 度")
        if balance < threshold:
            lines.append("⚠️ 当前电量低于预警阈值。")
        else:
            lines.append("✅ 当前电量未低于预警阈值。")
    else:
        lines.append("🔋 当前剩余电量：查询失败，暂无数据")
        lines.append(f"❌ 查询错误：{error_msg or '未知错误'}")
    lines.extend(["", "—— 自动监控脚本"])
    return subject, "\n".join(lines)


# ================= 电量查询与调度 =================

def select_token(tokens: Sequence[TokenConfig], store: MonitorStore, now: datetime) -> Optional[TokenConfig]:
    candidates = []
    for token in tokens:
        if not token.enabled:
            continue
        state = store.get_token_state(token.id)
        cooldown_until = parse_datetime(state.get("cooldown_until"))
        if cooldown_until and cooldown_until > now:
            continue
        last_used_at = parse_datetime(state.get("last_used_at"))
        if last_used_at and (now - last_used_at).total_seconds() < token.min_interval_seconds:
            continue
        candidates.append((int(state.get("failure_count") or 0), last_used_at or datetime.min, token))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates[0][2]


def seconds_until_next_token(tokens: Sequence[TokenConfig], store: MonitorStore, now: datetime) -> Optional[float]:
    """计算最近一个 token 还需要等待多久可用。"""
    waits = []
    for token in tokens:
        if not token.enabled:
            continue
        available_at = now
        state = store.get_token_state(token.id)
        cooldown_until = parse_datetime(state.get("cooldown_until"))
        if cooldown_until and cooldown_until > available_at:
            available_at = cooldown_until
        last_used_at = parse_datetime(state.get("last_used_at"))
        if last_used_at:
            min_available_at = last_used_at + timedelta(seconds=token.min_interval_seconds)
            if min_available_at > available_at:
                available_at = min_available_at
        waits.append(max(0.0, (available_at - now).total_seconds()))
    if not waits:
        return None
    return min(waits)


def select_token_with_wait(tokens: Sequence[TokenConfig], store: MonitorStore, max_wait_seconds: int = 60) -> Optional[TokenConfig]:
    """为手动测试等待短时间，避免 token 最小间隔导致连续测试中断。"""
    now = datetime.now()
    token = select_token(tokens, store, now)
    if token:
        return token
    wait_seconds = seconds_until_next_token(tokens, store, now)
    if wait_seconds is None or wait_seconds > max_wait_seconds:
        return None
    if wait_seconds > 0:
        print(f"⏳ 等待 token 可用：{wait_seconds:.1f} 秒")
        time.sleep(wait_seconds)
    return select_token(tokens, store, datetime.now())


def calculate_next_check(room: RoomConfig, check_cfg: Dict, now: datetime, success: bool) -> datetime:
    if success:
        interval_minutes = room.check_interval_minutes or normalize_int(
            check_cfg.get("default_interval_minutes"), 240, minimum=1
        )
        base_seconds = interval_minutes * 60
        jitter_seconds = normalize_int(check_cfg.get("jitter_seconds"), 60, minimum=0)
        jitter = random.randint(-jitter_seconds, jitter_seconds) if jitter_seconds else 0
        return now + timedelta(seconds=max(60, base_seconds + jitter))
    retry_minutes = normalize_int(check_cfg.get("retry_delay_minutes"), 30, minimum=1)
    return now + timedelta(minutes=retry_minutes)


def query_power_balance(api_cfg: Dict, token_value: str, room: RoomConfig) -> QueryResult:
    """查询单个宿舍电量余额。"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Synjones-Auth": token_value,
        "Origin": "https://mcard.sdu.edu.cn",
        "Referer": "https://mcard.sdu.edu.cn/",
        "Connection": "keep-alive",
    }
    data = {
        "type": api_cfg.get("type", "IEC"),
        "level": api_cfg.get("level", "3"),
        "feeitemid": api_cfg.get("feeitemid", "410"),
        "campus": room.campus_param,
        "building": room.building_param,
        "room": room.room,
    }
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 正在查询：{room.location_label}")
        response = requests.post(
            api_cfg.get("url", ""),
            headers=headers,
            data=data,
            timeout=api_cfg.get("timeout", 10),
            verify=True,
        )
        if response.status_code in (401, 403):
            return QueryResult(False, error_msg=f"HTTP {response.status_code}", error_kind="auth")
        if response.status_code != 200:
            return QueryResult(False, error_msg=f"HTTP {response.status_code}", error_kind="http")
        result = response.json()
        if result.get("code") != 200:
            message = f"接口错误：code={result.get('code')}"
            kind = "auth" if str(result.get("code")) in {"401", "403"} else "api"
            return QueryResult(False, error_msg=message, error_kind=kind)
        info_text = result.get("map", {}).get("showData", {}).get("信息", "")
        if not info_text:
            return QueryResult(False, error_msg="信息字段为空", error_kind="parse")
        match = re.search(r"([\d.]+)\s*度", info_text)
        if not match:
            return QueryResult(False, error_msg=f"无法解析电量：'{info_text}'", error_kind="parse")
        balance = float(match.group(1))
        print(f"✓ 查询成功：{room.location_label} 当前电量 {balance} 度")
        return QueryResult(True, balance=balance)
    except requests.RequestException as e:
        return QueryResult(False, error_msg=f"网络异常：{type(e).__name__}: {str(e)[:100]}", error_kind="network")
    except (ValueError, json.JSONDecodeError) as e:
        return QueryResult(False, error_msg=f"响应解析异常：{type(e).__name__}: {str(e)[:100]}", error_kind="parse")
    except OSError as e:
        return QueryResult(False, error_msg=f"异常：{type(e).__name__}: {str(e)[:100]}", error_kind="unknown")


def handle_success(config: AppConfig, store: MonitorStore, room: RoomConfig, balance: float, now: datetime):
    store.reset_error_alert(room.id)
    threshold = room.low_power_threshold or normalize_float(config.notify.get("low_power_threshold"), 5.0, minimum=0.01)
    max_count = normalize_int(config.notify.get("max_alert_count"), 3, minimum=1)
    state = store.get_room_state(room.id)

    if balance < threshold:
        if int(state.get("low_power_alert_count") or 0) < max_count:
            alert_count = store.increment_low_power_alert(room.id, now)
            subject, body = build_low_power_notice(room, balance, threshold, alert_count, max_count)
            store.enqueue_notification(room.id, "LOW_POWER", room.receivers, subject, body, due_at=now)
            print(f"⚠️  已加入低电量通知队列：{room.location_label} [{alert_count}/{max_count}]")
        else:
            print(f"⚠️  {room.location_label} 已达到最大低电量警告次数 ({max_count})")
    else:
        if int(state.get("low_power_alert_count") or 0) > 0:
            print(f"✓ {room.location_label} 电量恢复正常，重置低电量警告计数")
        store.reset_low_power_alert(room.id)


def handle_failure(config: AppConfig, store: MonitorStore, room: RoomConfig, error_msg: str, now: datetime):
    max_count = normalize_int(config.notify.get("max_error_alert_count"), 3, minimum=1)
    state = store.get_room_state(room.id)
    if int(state.get("error_alert_count") or 0) < max_count:
        alert_count = store.increment_error_alert(room.id, now)
        subject, body = build_error_notice(room, error_msg, alert_count, max_count)
        store.enqueue_notification(room.id, "QUERY_ERROR", room.receivers, subject, body, due_at=now)
        print(f"⚠️  已加入查询异常通知队列：{room.location_label} [{alert_count}/{max_count}]")
    else:
        print(f"⚠️  {room.location_label} 已达到最大错误警告次数 ({max_count})")


def run_checks(config: AppConfig, store: MonitorStore, limit: Optional[int] = None, force_all: bool = False):
    now = datetime.now()
    enabled_rooms = {room.id: room for room in config.rooms if room.enabled}
    store.ensure_rooms(list(enabled_rooms.values()), now)

    if force_all:
        due_room_ids = list(enabled_rooms.keys())
        if limit:
            due_room_ids = due_room_ids[:limit]
    else:
        batch_size = limit or normalize_int(config.check.get("batch_size"), 20, minimum=1)
        due_room_ids = store.get_due_room_ids(set(enabled_rooms.keys()), now, batch_size)

    if not due_room_ids:
        print("✓ 当前没有到期需要检查的宿舍")
        return

    print(f"📋 本轮计划检查 {len(due_room_ids)} 个宿舍")
    checked = 0
    for room_id in due_room_ids:
        room = enabled_rooms[room_id]
        request_time = datetime.now()
        token = select_token(config.tokens, store, request_time)
        if not token:
            print("⚠️  当前没有可用 token，剩余宿舍留待下次检查")
            logging.warning("没有可用 token，停止本轮检查")
            break

        store.mark_token_used(token.id, request_time)
        result = query_power_balance(config.api, token.value, room)
        checked_at = datetime.now()
        next_check_at = calculate_next_check(room, config.check, checked_at, result.success)

        if result.success and result.balance is not None:
            max_history_days = normalize_int(config.notify.get("history_days"), 14, minimum=2)
            store.record_success(room.id, result.balance, checked_at, next_check_at, max_history_days=max_history_days)
            store.record_token_success(token.id, checked_at)
            handle_success(config, store, room, result.balance, checked_at)
            logging.info("查询成功：%s %.2f 度", room.location_label, result.balance)
        else:
            error_msg = result.error_msg or "未知错误"
            store.record_failure(room.id, error_msg, checked_at, next_check_at)
            if result.error_kind in {"auth", "network"}:
                store.record_token_failure(token.id, checked_at, token.cooldown_seconds)
            handle_failure(config, store, room, error_msg, checked_at)
            logging.error("查询失败：%s %s", room.location_label, error_msg)

        checked += 1
        sleep_seconds = normalize_float(config.check.get("request_interval_seconds"), 3.0, minimum=0.0)
        if sleep_seconds > 0 and checked < len(due_room_ids):
            time.sleep(sleep_seconds)

    print(f"✓ 本轮检查完成：{checked}/{len(due_room_ids)}")


def enqueue_daily_reports(config: AppConfig, store: MonitorStore, now: datetime):
    daily_hour = normalize_int(config.notify.get("daily_report_hour"), 8, minimum=0)
    if now.hour != daily_hour:
        return
    today = now.strftime("%Y-%m-%d")
    queued = 0
    for room in config.rooms:
        if not room.enabled or not room.receivers:
            continue
        state = store.get_room_state(room.id)
        if state.get("last_daily_report_date") == today:
            continue
        balance = state.get("last_balance")
        if balance is None:
            continue
        subject, body = build_daily_report(config, store, room, float(balance))
        store.enqueue_notification(room.id, "DAILY_REPORT", room.receivers, subject, body, due_at=now)
        store.mark_daily_report_queued(room.id, today, now)
        queued += 1
    if queued:
        print(f"📊 已加入 {queued} 封电量日报到通知队列")


def run_notifications(config: AppConfig, store: MonitorStore, limit: Optional[int] = None):
    now = datetime.now()
    enqueue_daily_reports(config, store, now)
    if not config.email.get("enabled", True):
        print("⚠️  邮件通知已禁用，跳过发送队列")
        return

    send_limit = limit or normalize_int(config.notify.get("send_batch_size"), 50, minimum=1)
    notices = store.get_pending_notifications(now, send_limit)
    if not notices:
        print("✓ 当前没有到期需要发送的通知")
        return

    print(f"📧 本轮计划发送 {len(notices)} 封通知")
    max_attempts = normalize_int(config.notify.get("max_send_attempts"), 3, minimum=1)
    retry_delay = normalize_int(config.notify.get("retry_delay_minutes"), 15, minimum=1)
    sent = 0
    for notice in notices:
        recipients = json.loads(notice["recipients_json"])
        success = send_email(config.email, recipients, notice["subject"], notice["body"])
        if success:
            store.mark_notification_sent(notice["id"], datetime.now())
            sent += 1
        else:
            attempts = int(notice.get("attempts") or 0) + 1
            final = attempts >= max_attempts
            next_due = datetime.now() + timedelta(minutes=retry_delay)
            store.mark_notification_failed(notice["id"], "邮件发送失败", next_due, final=final)
    print(f"✓ 本轮通知发送完成：{sent}/{len(notices)}")


def run_test_email(config: AppConfig, store: MonitorStore, room_id: Optional[str] = None, test_all: bool = False):
    """实时查询一个宿舍并立即发送测试邮件，不进入通知队列。"""
    candidates = [room for room in config.rooms if room.enabled and room.receivers]
    if room_id:
        candidates = [room for room in candidates if room.id == room_id]
        if not candidates:
            print(f"❌ 未找到可测试的宿舍：{room_id}")
            return
    if not candidates:
        print("❌ 没有启用且配置了收件人的宿舍，无法发送测试邮件")
        return
    if not test_all:
        candidates = candidates[:1]

    print(f"📧 本轮计划发送 {len(candidates)} 封测试邮件")
    success_count = 0
    wait_seconds = normalize_int(config.check.get("test_email_token_wait_seconds"), 60, minimum=0)
    for index, room in enumerate(candidates, start=1):
        now = datetime.now()
        store.ensure_rooms([room], now)
        token = select_token_with_wait(config.tokens, store, max_wait_seconds=wait_seconds)
        if not token:
            print("❌ 当前没有可用 token，停止发送测试邮件")
            break

        store.mark_token_used(token.id, datetime.now())
        result = query_power_balance(config.api, token.value, room)
        checked_at = datetime.now()
        if result.success:
            store.record_token_success(token.id, checked_at)
        elif result.error_kind in {"auth", "network"}:
            store.record_token_failure(token.id, checked_at, token.cooldown_seconds)

        subject, body = build_test_email_notice(config, room, result.balance, result.error_msg)
        success = send_email(config.email, room.receivers, subject, body)
        if success:
            success_count += 1
            print(f"✅ 测试邮件已立即发送：{room.location_label}")
        else:
            print(f"❌ 测试邮件发送失败：{room.location_label}")

        sleep_seconds = normalize_float(config.check.get("request_interval_seconds"), 3.0, minimum=0.0)
        if sleep_seconds > 0 and index < len(candidates):
            time.sleep(sleep_seconds)

    print(f"✓ 测试邮件发送完成：{success_count}/{len(candidates)}")


# ================= 命令行入口 =================

def build_parser():
    parser = argparse.ArgumentParser(description="山东大学青岛校区宿舍电量监控脚本")
    parser.add_argument(
        "command",
        nargs="?",
        default="run",
        choices=["run", "check", "notify", "check-all", "test-email", "validate"],
        help="run=检查并发送队列；check=只检查电量；notify=只发送通知；check-all=忽略调度检查所有宿舍；test-email=立即发送测试邮件；validate=只校验配置",
    )
    command_flags = parser.add_mutually_exclusive_group()
    command_flags.add_argument("--check", action="store_const", const="check", dest="command_flag", help="只检查电量")
    command_flags.add_argument("--notify", action="store_const", const="notify", dest="command_flag", help="只发送通知")
    command_flags.add_argument(
        "--check-all",
        action="store_const",
        const="check-all",
        dest="command_flag",
        help="忽略调度检查所有宿舍",
    )
    command_flags.add_argument(
        "--test-email",
        action="store_const",
        const="test-email",
        dest="command_flag",
        help="实时查询一个宿舍并立即发送测试邮件",
    )
    command_flags.add_argument("--validate", action="store_const", const="validate", dest="command_flag", help="只校验配置")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径，默认 config.yaml")
    parser.add_argument("--limit", type=int, default=None, help="限制本轮处理数量")
    parser.add_argument("--room-id", default=None, help="指定要测试的宿舍 id，主要用于 test-email")
    parser.add_argument("--all", action="store_true", help="test-email 时测试所有启用且有收件人的宿舍")
    return parser


def print_startup(config: AppConfig):
    enabled_rooms = [room for room in config.rooms if room.enabled]
    print("=" * 70)
    print("🔋 多宿舍低电费预警系统启动")
    print("=" * 70)
    print(f"📍 已启用宿舍：{len(enabled_rooms)}/{len(config.rooms)}")
    print(f"🔑 已启用 Token：{sum(1 for token in config.tokens if token.enabled)}/{len(config.tokens)}")
    print(f"⏱️  默认检查周期：{config.check.get('default_interval_minutes')} 分钟")
    print(f"🚦 单轮检查数量：{config.check.get('batch_size')}")
    print(f"📧 单轮发信数量：{config.notify.get('send_batch_size')}")
    print(f"📊 日报时间：每日 {config.notify.get('daily_report_hour')}:00")
    print("=" * 70)


def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.command_flag:
        args.command = args.command_flag
    config = load_config(args.config)
    setup_logging(config)

    if args.command == "validate":
        print_startup(config)
        print("✅ 配置校验通过")
        return

    print_startup(config)
    db_path = resolve_path(BASE_DIR, config.paths.get("state_db", "power_monitor.sqlite3"))
    store = MonitorStore(db_path)
    try:
        if args.command == "check":
            run_checks(config, store, limit=args.limit)
        elif args.command == "notify":
            run_notifications(config, store, limit=args.limit)
        elif args.command == "check-all":
            run_checks(config, store, limit=args.limit, force_all=True)
        elif args.command == "test-email":
            run_test_email(config, store, room_id=args.room_id, test_all=args.all)
        else:
            run_checks(config, store, limit=args.limit)
            run_notifications(config, store, limit=args.limit)
    finally:
        store.close()
    print("=" * 70)
    print("✅ 执行完成")
    logging.info("本轮执行完成")
    print("=" * 70)


if __name__ == "__main__":
    main()
