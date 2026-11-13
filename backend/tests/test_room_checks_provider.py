from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
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
            balance=Decimal("21.18"),
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
        assert room.provider_room_key == "fake-room-key"
        assert room.provider_line_id == "10"
