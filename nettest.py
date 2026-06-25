#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Token 池连通性测试脚本。"""

import argparse
import sys

import main


for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        try:
            stream.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass


def build_parser():
    parser = argparse.ArgumentParser(description="测试 config.yaml 中配置的所有 token")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径，默认 config.yaml")
    parser.add_argument("--room-id", default=None, help="指定用于测试请求参数的宿舍 id")
    parser.add_argument("--include-disabled", action="store_true", help="同时测试 enabled=false 的 token")
    return parser


def select_room(config, room_id=None):
    rooms = [room for room in config.rooms if room.enabled]
    if room_id:
        rooms = [room for room in rooms if room.id == room_id]
    if not rooms:
        raise ValueError(f"未找到可用于测试的宿舍：{room_id or '任意启用宿舍'}")
    return rooms[0]


def test_tokens(config, room, include_disabled=False):
    tokens = [token for token in config.tokens if include_disabled or token.enabled]
    if not tokens:
        print("❌ 没有可测试的 token")
        return False

    print("=" * 70)
    print("🔑 Token 池连通性测试")
    print("=" * 70)
    print(f"📍 测试宿舍：{room.location_label}")
    print(f"🧪 待测试 token：{len(tokens)}")
    print("=" * 70)

    success_count = 0
    for token in tokens:
        print(f"\n🔍 测试 token：{token.id}")
        result = main.query_power_balance(config.api, token.value, room)
        if result.success:
            success_count += 1
            print(f"✅ {token.id} 可用，当前电量：{result.balance:.2f} 度")
        else:
            print(f"❌ {token.id} 不可用：{result.error_msg}")

    print("\n" + "=" * 70)
    print(f"✅ 测试完成：{success_count}/{len(tokens)} 个 token 可用")
    print("=" * 70)
    return success_count == len(tokens)


def main_cli():
    args = build_parser().parse_args()
    config = main.load_config(args.config)
    try:
        room = select_room(config, room_id=args.room_id)
    except ValueError as exc:
        print(f"❌ {exc}")
        return 1
    return 0 if test_tokens(config, room, include_disabled=args.include_disabled) else 1


if __name__ == "__main__":
    sys.exit(main_cli())
