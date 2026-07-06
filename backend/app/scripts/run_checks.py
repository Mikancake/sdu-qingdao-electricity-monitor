import argparse

from app.services.room_checks import run_room_checks


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one electricity check batch.")
    parser.add_argument("--all", action="store_true", help="Check rooms without waiting for their schedule")
    parser.add_argument("--limit", type=int, default=None, help="Max rooms to check")
    parser.add_argument("--delay", type=float, default=None, help="Delay between requests in seconds")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = run_room_checks(check_all=args.all, limit=args.limit, delay_seconds=args.delay, source="cli")
    print(f"checked={result.checked} succeeded={result.succeeded} failed={result.failed}")
    for outcome in result.outcomes:
        if outcome.success:
            print(f"room={outcome.room_id} ok balance={outcome.balance}")
        else:
            print(f"room={outcome.room_id} failed kind={outcome.error_kind} message={outcome.error_msg}")
    return 0 if result.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
