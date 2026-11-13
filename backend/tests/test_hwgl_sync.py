from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.electricity.hwgl_client import HwglPriceRecord, HwglRechargeRecord
from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.room import Room
from app.services.hwgl_sync import sync_hwgl_room


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


class FakeMetadataClient:
    daily_result = ElectricityQueryResult(
        success=True,
        balance=Decimal("23.50"),
        provider="hwgl",
        provider_updated_at=datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc),
        reported_daily_usage=Decimal("4.35"),
        reported_usage_date=date(2026, 8, 27),
        power_status="正常供电",
        free_electricity=Decimal("5"),
        paid_electricity=Decimal("20"),
        arrears_electricity=Decimal("1.5"),
        resolved_room_key="fake-room-key",
        resolved_line_id="10",
        resolved_campus="山东大学青岛校区",
        resolved_building="凤凰居11公寓",
        resolved_floor="2",
    )

    def query_price(self, room: Room) -> HwglPriceRecord:
        return HwglPriceRecord(price=Decimal("0.52"), fetched_at=datetime.now(timezone.utc))

    def query_daily_records(self, room: Room, start_date: date, end_date: date) -> list[ElectricityQueryResult]:
        return [self.daily_result]

    def query_recharges(self, room: Room, *, start_at=None, end_at=None, page_size=1000) -> list[HwglRechargeRecord]:
        return [
            HwglRechargeRecord(
                external_id_hash="a" * 64,
                external_id_tail="123456",
                paid_at=datetime(2026, 8, 27, 9, 0, tzinfo=timezone.utc),
                amount=Decimal("30"),
                line_type="照明",
                payment_status="已支付",
                processing_status="已入账",
            )
        ]


def test_hwgl_metadata_sync_upserts_daily_data_price_and_recharges_idempotently() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.commit()

        first = sync_hwgl_room(
            db,
            room,
            client=FakeMetadataClient(),
            history_days=3,
            recharge_days=30,
        )
        second = sync_hwgl_room(
            db,
            room,
            client=FakeMetadataClient(),
            history_days=3,
            recharge_days=30,
        )

        readings = list(db.scalars(select(ElectricityReading)))
        recharges = list(db.scalars(select(ElectricityRecharge)))
        db.refresh(room)

        assert first.daily_readings_upserted == 1
        assert first.recharges_upserted == 1
        assert first.price_updated is True
        assert second.daily_readings_upserted == 0
        assert second.recharges_upserted == 0
        assert second.price_updated is False
        assert len(readings) == 1
        assert readings[0].electricity_price == Decimal("0.52")
        assert readings[0].estimated_amount == Decimal("12.22")
        assert len(recharges) == 1
        assert room.provider_room_key == "fake-room-key"
        assert room.provider_line_id == "10"
        assert room.provider_price == Decimal("0.52")
