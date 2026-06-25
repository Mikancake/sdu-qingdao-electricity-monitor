#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""宿舍通知用户管理工具。"""

import argparse
import csv
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ 缺少依赖：pyyaml")
    print("💡 请运行：pip3 install pyyaml")
    sys.exit(1)


for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass


BASE_DIR = Path(__file__).resolve().parent
ROOM_FIELDS = [
    "id",
    "campus",
    "campus_param",
    "building_key",
    "building_param",
    "room",
    "receivers",
    "check_interval_minutes",
    "low_power_threshold",
    "enabled",
]


def resolve_path(base: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return base / path


def load_config(config_file: str):
    config_path = resolve_path(BASE_DIR, config_file)
    if not config_path.exists():
        raise SystemExit(f"❌ 配置文件不存在：{config_path}")
    with config_path.open("r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    return config_path, config


def get_rooms_path(config_path: Path, config: dict) -> Path:
    rooms_file = config.get("rooms_file") or "rooms.csv"
    return resolve_path(config_path.parent, rooms_file)


def parse_receivers(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        parts = []
        for item in value:
            parts.extend(re.split(r"[;,]", str(item)))
    else:
        parts = re.split(r"[;,]", str(value))
    return [item.strip() for item in parts if item and item.strip()]


def format_receivers(receivers: list) -> str:
    seen = []
    for receiver in receivers:
        receiver = receiver.strip()
        if receiver and receiver not in seen:
            seen.append(receiver)
    return ";".join(seen)


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^0-9a-zA-Z_\-\u4e00-\u9fff]+", "-", value)
    return value.strip("-") or "room"


def load_rooms(path: Path) -> list:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            rows.append({field: row.get(field, "") for field in ROOM_FIELDS})
        return rows


def save_rooms(path: Path, rows: list):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ROOM_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def find_room(rows: list, room_id: str):
    for row in rows:
        if row.get("id") == room_id:
            return row
    return None


def validate_building(config: dict, building_key: str, building_param: str):
    building_params = config.get("building_params") or config.get("buildings") or {}
    if building_key:
        if building_key not in building_params:
            known = ", ".join(sorted(building_params.keys())) or "无"
            raise SystemExit(f"❌ 未知 building_key：{building_key}\n可用 building_key：{known}")
        return building_key, ""
    if building_param:
        return "", building_param
    raise SystemExit("❌ 必须提供 --building-key 或 --building-param")


def command_add(args):
    config_path, config = load_config(args.config)
    rooms_path = get_rooms_path(config_path, config)
    rows = load_rooms(rooms_path)

    building_key, building_param = validate_building(config, args.building_key, args.building_param)
    room_id = args.id or f"{building_key or slugify(building_param)}-{slugify(args.room)}"
    existing = find_room(rows, room_id)
    if existing and not args.update:
        raise SystemExit(f"❌ 宿舍 id 已存在：{room_id}。如需覆盖请加 --update")

    receivers = format_receivers(args.receivers)
    row = {
        "id": room_id,
        "campus": args.campus,
        "campus_param": args.campus_param,
        "building_key": building_key,
        "building_param": building_param,
        "room": args.room,
        "receivers": receivers,
        "check_interval_minutes": args.check_interval_minutes or "",
        "low_power_threshold": args.low_power_threshold or "",
        "enabled": "true" if args.enabled else "false",
    }

    if existing:
        existing.update(row)
        action = "更新"
    else:
        rows.append(row)
        action = "新增"
    save_rooms(rooms_path, rows)
    print(f"✅ 已{action}宿舍：{room_id}")
    print(f"📄 文件：{rooms_path}")


def command_add_receiver(args):
    config_path, config = load_config(args.config)
    rooms_path = get_rooms_path(config_path, config)
    rows = load_rooms(rooms_path)
    row = find_room(rows, args.room_id)
    if not row:
        raise SystemExit(f"❌ 未找到宿舍 id：{args.room_id}")
    receivers = parse_receivers(row.get("receivers", ""))
    receivers.extend(args.receivers)
    row["receivers"] = format_receivers(receivers)
    save_rooms(rooms_path, rows)
    print(f"✅ 已更新收件人：{args.room_id}")


def command_set_enabled(args):
    config_path, config = load_config(args.config)
    rooms_path = get_rooms_path(config_path, config)
    rows = load_rooms(rooms_path)
    row = find_room(rows, args.room_id)
    if not row:
        raise SystemExit(f"❌ 未找到宿舍 id：{args.room_id}")
    row["enabled"] = "true" if args.enabled else "false"
    save_rooms(rooms_path, rows)
    print(f"✅ 已{'启用' if args.enabled else '禁用'}宿舍：{args.room_id}")


def command_list(args):
    config_path, config = load_config(args.config)
    rooms_path = get_rooms_path(config_path, config)
    rows = load_rooms(rooms_path)
    if not rows:
        print(f"ℹ️  暂无宿舍记录：{rooms_path}")
        return
    print(f"📄 文件：{rooms_path}")
    print(f"📋 宿舍数量：{len(rows)}")
    for row in rows:
        enabled = str(row.get("enabled", "true")).lower() in {"1", "true", "yes", "on"}
        receivers_count = len(parse_receivers(row.get("receivers", "")))
        print(f"- {row.get('id')} | {row.get('building_key') or row.get('building_param')} {row.get('room')} | 收件人 {receivers_count} | {'启用' if enabled else '禁用'}")


def build_parser():
    parser = argparse.ArgumentParser(description="管理 rooms.csv 中的宿舍和收件人")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径，默认 config.yaml")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add", help="新增或更新一个宿舍")
    add.add_argument("--id", help="宿舍记录 id，默认由 building_key 和 room 自动生成")
    add.add_argument("--campus", default="青岛校区")
    add.add_argument("--campus-param", default="青岛校区&青岛校区")
    add.add_argument("--building-key", default="", help="config.yaml 中 building_params 的 key")
    add.add_argument("--building-param", default="", help="不使用 building_key 时，直接写接口楼宇参数")
    add.add_argument("--room", required=True, help="宿舍号")
    add.add_argument("--receiver", dest="receivers", action="append", required=True, help="收件邮箱，可重复传入")
    add.add_argument("--check-interval-minutes", default="")
    add.add_argument("--low-power-threshold", default="")
    add.add_argument("--disabled", action="store_false", dest="enabled", help="新增后默认禁用")
    add.add_argument("--update", action="store_true", help="id 已存在时覆盖更新")
    add.set_defaults(func=command_add)

    add_receiver = subparsers.add_parser("add-receiver", help="给已有宿舍追加收件邮箱")
    add_receiver.add_argument("--room-id", required=True)
    add_receiver.add_argument("--receiver", dest="receivers", action="append", required=True, help="收件邮箱，可重复传入")
    add_receiver.set_defaults(func=command_add_receiver)

    enable = subparsers.add_parser("enable", help="启用宿舍")
    enable.add_argument("--room-id", required=True)
    enable.set_defaults(func=command_set_enabled, enabled=True)

    disable = subparsers.add_parser("disable", help="禁用宿舍")
    disable.add_argument("--room-id", required=True)
    disable.set_defaults(func=command_set_enabled, enabled=False)

    list_cmd = subparsers.add_parser("list", help="列出宿舍")
    list_cmd.set_defaults(func=command_list)

    return parser


def main():
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
