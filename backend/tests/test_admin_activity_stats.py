from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.admin_stats import _build_activity_series, _build_building_stats


class FakeSession:
    def __init__(self) -> None:
        self.responses = iter(
            [
                [("2026-07-08", 5), ("2026-07-10", 8)],
                [("2026-07-09", 3)],
                [("2026-07-10", 1)],
                [("2026-07-10", 2)],
                [("2026-07-10", 7)],
                [("2026-07-09", 2)],
            ]
        )

    def execute(self, _statement):
        return next(self.responses)


def test_activity_series_fills_missing_days_and_keeps_real_counts() -> None:
    series = _build_activity_series(FakeSession(), today=date(2026, 7, 10))  # type: ignore[arg-type]

    assert len(series) == 7
    assert series[0].day == date(2026, 7, 4)
    assert series[-1].day == date(2026, 7, 10)
    assert series[4].readings == 5
    assert series[5].emails_sent == 3
    assert series[6].readings == 8
    assert series[6].emails_failed == 1
    assert series[6].checks_succeeded == 7
    assert series[5].checks_failed == 2
    assert series[6].new_users == 2
    assert series[0].readings == 0


def test_building_stats_group_bound_rooms_and_use_each_latest_balance_once() -> None:
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    Room.__table__.create(engine)
    UserRoom.__table__.create(engine)
    ElectricityReading.__table__.create(engine)

    with Session(engine) as db:
        users = [
            User(email=f"user{index}@example.com", password_hash="hash", is_verified=True)
            for index in range(2)
        ]
        rooms = [
            Room(
                campus="示例校区",
                campus_param="demo-campus",
                building_key="building-a",
                building_name="示例一号楼",
                building_param="building-a-param",
                room_number=f"A10{index + 1}",
            )
            for index in range(2)
        ]
        db.add_all([*users, *rooms])
        db.flush()
        db.add_all(
            [
                UserRoom(user_id=users[0].id, room_id=rooms[0].id, enabled=True),
                UserRoom(user_id=users[1].id, room_id=rooms[0].id, enabled=False),
                UserRoom(user_id=users[0].id, room_id=rooms[1].id, enabled=True),
            ]
        )
        now = datetime.now()
        db.add_all(
            [
                ElectricityReading(room_id=rooms[0].id, balance=Decimal("12.00"), read_at=now - timedelta(hours=4)),
                ElectricityReading(room_id=rooms[0].id, balance=Decimal("10.00"), read_at=now),
                ElectricityReading(room_id=rooms[1].id, balance=Decimal("30.00"), read_at=now),
            ]
        )
        db.commit()

        stats = _build_building_stats(db)

        assert len(stats) == 1
        assert stats[0].room_count == 2
        assert stats[0].binding_count == 3
        assert stats[0].enabled_binding_count == 2
        assert stats[0].user_count == 2
        assert stats[0].rooms_with_readings == 2
        assert stats[0].average_latest_balance == Decimal("20.00")
