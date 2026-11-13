"""Backfill migrated HWGL rooms and remove their known-bad legacy readings."""

import argparse

from app.db.session import SessionLocal
from app.services.hwgl_backfill import HwglBackfillOptions, backfill_hwgl_rooms


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill exact HWGL daily records for migrated rooms.",
    )
    parser.add_argument("--days", type=int, default=30, help="History window to request (default: 30)")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of HWGL rooms")
    parser.add_argument("--delay", type=float, default=0.05, help="Delay between upstream requests")
    parser.add_argument(
        "--keep-legacy",
        action="store_true",
        help="Keep old mcard readings instead of deleting them after a successful backfill",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    options = HwglBackfillOptions(
        days=args.days,
        limit=args.limit,
        delay_seconds=args.delay,
        purge_legacy=not args.keep_legacy,
    )
    with SessionLocal() as db:
        summary = backfill_hwgl_rooms(db, options=options)

    print(
        " ".join(
            [
                f"rooms_scanned={summary.rooms_scanned}",
                f"rooms_refreshed={summary.rooms_refreshed}",
                f"rooms_failed={summary.rooms_failed}",
                f"readings_inserted={summary.readings_inserted}",
                f"legacy_readings_deleted={summary.legacy_readings_deleted}",
            ]
        )
    )
    for failure in summary.failures:
        print(f"room_id={failure.room_id} failed kind={failure.error_kind}")
    return 0 if summary.rooms_failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
