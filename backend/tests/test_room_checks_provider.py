from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.runtime_settings import RuntimeConfig
from app.services import room_checks
from app.services.electricity_queries import ElectricityQueryExecution


def test_room_check_persists_provider_metadata_without_token(monkeypatch) -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    updated_at = datetime(2026, 8, 28, 16, 0, 11)

    with Session(engine, expire_on_commit=False) as db:
        room = Room(
            campus="青岛校区",
            campus_param="青岛校区&青岛校区",
            building_key="fenghuang_11",
            building_name="凤凰居11公寓",
            building_param="hwgl&凤凰居11公寓",
            room_number="901",
            provider="hwgl",
            provider_campus="山东大学青岛校区",
            provider_building="凤凰居11公寓",
        )
        db.add(room)
        db.commit()

        result = ElectricityQueryResult(
            success=True,
            balance=Decimal("21.185"),
            provider="hwgl",
            provider_updated_at=updated_at,
            reported_daily_usage=Decimal("4.4000"),
            reported_usage_date=date(2026, 8, 27),
            power_status="正常供电",
            resolved_room_key="fake-room-key",
            resolved_line_id="10",
            resolved_campus="山东大学青岛校区",
            resolved_building="凤凰居11公寓",
            resolved_floor="2",
        )
        monkeypatch.setattr(
            room_checks,
            "execute_room_query",
            lambda target, source: ElectricityQueryExecution(result=result, auth_token_id=None),
        )

        outcome = room_checks.check_and_store_room(db, room, source="test")

        assert outcome.success is True
        reading = db.scalar(select(ElectricityReading))
        attempt = db.scalar(select(CheckAttempt))
        assert reading is not None
        assert reading.provider == "hwgl"
        assert reading.provider_updated_at == updated_at
        assert reading.reported_daily_usage == Decimal("4.4000")
        assert reading.reported_usage_date == date(2026, 8, 27)
        assert reading.power_status == "正常供电"
        assert attempt is not None and attempt.auth_token_id is None
        assert attempt.balance == reading.balance == Decimal("21.19")
        assert room.provider_room_key == "fake-room-key"
        assert room.provider_line_id == "10"


def test_due_checks_exclude_recent_utc_readings_and_probe_only_rooms(monkeypatch) -> None:
    now = datetime(2026, 8, 28, 8, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else (now + timedelta(hours=8)).replace(tzinfo=None)

    monkeypatch.setattr(room_checks, "datetime", Clock)
    monkeypatch.setattr(room_checks, "get_runtime_config", lambda db: RuntimeConfig(check_interval_seconds=600))
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="test@example.com", password_hash="test", is_verified=True)
        for number in ("recent", "due", "probe"):
            room = Room(building_name="test", building_param="test", room_number=number, probe_only=number == "probe")
            db.add(UserRoom(user=user, room=room))
            if number == "recent":
                db.flush()
                db.add(ElectricityReading(room_id=room.id, balance=10, read_at=now - timedelta(seconds=599)))
        db.commit()
        assert [r.room_number for r in room_checks.list_due_rooms(db)] == ["due"]
        assert {r.room_number for r in db.scalars(room_checks.bound_room_statement())} == {"recent", "due"}
