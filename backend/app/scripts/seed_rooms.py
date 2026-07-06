import argparse
import csv
from pathlib import Path

from sqlalchemy import select

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.room import Room
from app.services.rooms import RoomInputError, normalize_room_data


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import rooms from rooms.csv into the backend database.")
    parser.add_argument("--file", default="../rooms.csv", help="Path to rooms.csv")
    parser.add_argument("--include-disabled", action="store_true", help="Import rows whose enabled column is false")
    return parser


def truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() not in {"0", "false", "no", "off", "disabled"}


def main() -> int:
    args = build_parser().parse_args()
    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"room file not found: {path}")

    Base.metadata.create_all(bind=engine)
    imported = 0
    skipped = 0
    with SessionLocal() as db:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for index, row in enumerate(csv.DictReader(handle), start=2):
                if not args.include_disabled and not truthy(row.get("enabled", "true")):
                    skipped += 1
                    continue
                payload = {
                    "campus": row.get("campus"),
                    "campus_param": row.get("campus_param"),
                    "building_key": row.get("building_key"),
                    "building_name": row.get("building_name") or row.get("building"),
                    "building_param": row.get("building_param"),
                    "room_number": row.get("room_number") or row.get("room"),
                }
                try:
                    room_data = normalize_room_data(payload)
                except RoomInputError as exc:
                    raise SystemExit(f"invalid room at line {index}: {exc}") from exc

                room = db.scalar(
                    select(Room).where(
                        Room.campus_param == room_data["campus_param"],
                        Room.building_param == room_data["building_param"],
                        Room.room_number == room_data["room_number"],
                    )
                )
                if room is None:
                    room = Room(**room_data)
                    db.add(room)
                else:
                    for key, value in room_data.items():
                        setattr(room, key, value)
                imported += 1
        db.commit()

    print(f"rooms imported: {imported}, skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
