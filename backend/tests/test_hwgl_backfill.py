from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.hwgl_backfill import HwglBackfillOptions, backfill_hwgl_rooms
from app.services.usage import get_room_usage_stats, list_room_readings


def _room() -> Room:
    return Room(
        campus="青岛校区",
        campus_param="青岛校区&青岛校区",
        building_key="fenghuang_11",
        building_name="凤凰居11公寓",
        building_param="hwgl&凤凰居11公寓",
        room_number="TEST-901",
        provider="hwgl",
        provider_campus="山东大学青岛校区",
        provider_building="凤凰居11公寓",
    )


class FakeHistoryClient:
    def query_room_for_date(self, room: Room, query_date: date) -> ElectricityQueryResult:
        offset = date(2026, 8, 28) - query_date
        return ElectricityQueryResult(
            success=True,
            balance=Decimal("20.125") + offset.days,
            provider="hwgl",
            provider_updated_at=datetime.combine(query_date, datetime.min.time(), ZoneInfo("Asia/Shanghai")) + timedelta(hours=20),
            reported_daily_usage=Decimal("4.00"),
            reported_usage_date=query_date - timedelta(days=1),
            power_status="正常供电",
            resolved_room_key="fake-room-key",
            resolved_line_id="10",
            resolved_campus="山东大学青岛校区",
            resolved_building="凤凰居11公寓",
            resolved_floor="2",
        )


def test_current_provider_filter_hides_legacy_points() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        db.add_all(
            [
                ElectricityReading(room_id=room.id, balance=Decimal("88"), provider="mcard", source="legacy"),
                ElectricityReading(room_id=room.id, balance=Decimal("20"), provider="hwgl", source="new"),
            ]
        )
        db.commit()

        current = list_room_readings(db, room.id, provider=room.provider)
        stats, stats_readings = get_room_usage_stats(
            db,
            room.id,
            alert_days=1,
            alert_threshold_mode="days",
            fixed_threshold=None,
        )

        assert [reading.provider for reading in current] == ["hwgl"]
        assert [reading.provider for reading in stats_readings] == ["hwgl"]
        assert stats.latest_balance == Decimal("20.00")


def test_backfill_replaces_legacy_history_after_success() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        legacy = ElectricityReading(
            room_id=room.id,
            balance=Decimal("88"),
            provider="mcard",
            source="legacy",
        )
        db.add(legacy)
        db.flush()
        attempt = CheckAttempt(
            room_id=room.id,
            reading_id=legacy.id,
            source="worker",
            success=True,
            balance=legacy.balance,
            started_at=datetime(2026, 8, 20, 8, 0),
        )
        db.add(attempt)
        binding = UserRoom(room=room, user=User(email="test@example.com", password_hash="test"))
        db.add(binding)
        db.flush()
        notification = Notification(room_id=room.id, user_id=binding.user_id, user_room_id=binding.id,
                                    reading_id=legacy.id, subject="test", body="test", recipient_email=binding.user.email)
        db.add(notification)
        db.commit()

        options = HwglBackfillOptions(
            days=2,
            delay_seconds=0,
            today=date(2026, 8, 28),
        )
        summary = backfill_hwgl_rooms(db, options=options, client=FakeHistoryClient())

        readings = list(db.scalars(select(ElectricityReading).order_by(ElectricityReading.provider_updated_at)))
        db.refresh(attempt)
        db.refresh(room)
        assert summary.rooms_refreshed == 1
        assert summary.readings_inserted == 2
        assert summary.legacy_readings_deleted == 1
        assert [reading.provider for reading in readings] == ["hwgl", "hwgl"]
        assert attempt.reading_id is None
        assert room.provider_room_key == "fake-room-key"
        assert room.provider_line_id == "10"
        db.refresh(notification)
        assert notification.reading_id is None
        repeated = backfill_hwgl_rooms(db, options=options, client=FakeHistoryClient())
        assert repeated.readings_inserted == repeated.legacy_readings_deleted == 0


def test_interrupted_backfill_keeps_legacy_readings() -> None:
    class Interrupted(FakeHistoryClient):
        def query_room_for_date(self, room, query_date):
            if query_date.day == 27:
                return ElectricityQueryResult(False, provider="hwgl", error_kind="network")
            return super().query_room_for_date(room, query_date)

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        room = _room()
        db.add(room)
        db.flush()
        db.add(ElectricityReading(room_id=room.id, balance=10, provider="mcard"))
        db.commit()
        options = HwglBackfillOptions(days=2, today=date(2026, 8, 28), delay_seconds=0)
        result = backfill_hwgl_rooms(db, options=options, client=Interrupted())
        assert result.rooms_failed == 1 and result.failures[0].error_kind == "network"
        assert result.readings_inserted == result.legacy_readings_deleted == 0
        assert db.scalars(select(ElectricityReading.provider)).one() == "mcard"
