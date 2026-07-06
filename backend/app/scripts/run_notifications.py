import argparse

from app.services.notifications import run_low_power_notifications


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one low-power notification batch.")
    parser.add_argument("--limit", type=int, default=None, help="Max bindings to scan")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = run_low_power_notifications(limit=args.limit)
    print(
        f"scanned={result.scanned} sent={result.sent} "
        f"skipped={result.skipped} failed={result.failed}"
    )
    if result.notifications:
        print("notification_ids=" + ",".join(str(item) for item in result.notifications))
    return 0 if result.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
