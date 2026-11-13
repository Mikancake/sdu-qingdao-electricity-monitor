from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ElectricityReadingOut(BaseModel):
    id: int
    room_id: int
    balance: Decimal
    source: str
    provider: str
    provider_updated_at: datetime | None
    reported_daily_usage: Decimal | None
    reported_usage_date: date | None
    power_status: str | None
    free_electricity: Decimal | None = None
    paid_electricity: Decimal | None = None
    arrears_electricity: Decimal | None = None
    electricity_price: Decimal | None = None
    estimated_amount: Decimal | None = None
    read_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CheckAttemptRoomOut(BaseModel):
    id: int
    campus: str
    building_name: str
    room_number: str

    model_config = ConfigDict(from_attributes=True)


class CheckAttemptOut(BaseModel):
    id: int
    room_id: int
    user_room_id: int | None
    reading_id: int | None
    source: str
    success: bool
    balance: Decimal | None
    error_kind: str | None
    error_msg: str | None
    started_at: datetime
    finished_at: datetime | None
    room: CheckAttemptRoomOut

    model_config = ConfigDict(from_attributes=True)


class RecentReadingOut(BaseModel):
    id: int
    balance: Decimal
    provider: str
    provider_updated_at: datetime | None
    reported_daily_usage: Decimal | None
    reported_usage_date: date | None
    power_status: str | None
    free_electricity: Decimal | None = None
    paid_electricity: Decimal | None = None
    arrears_electricity: Decimal | None = None
    electricity_price: Decimal | None = None
    estimated_amount: Decimal | None = None
    read_at: datetime

    # ``build_dashboard_item`` passes SQLAlchemy reading objects directly into
    # this nested response model.  Without ORM attribute validation, every
    # populated dashboard returned a Pydantic ``model_type`` error and the
    # frontend incorrectly fell back to the empty-binding state.
    model_config = ConfigDict(from_attributes=True)


class ElectricityRechargeOut(BaseModel):
    id: int
    room_id: int
    provider: str
    external_id_tail: str | None
    paid_at: datetime | None
    amount: Decimal | None
    line_type: str | None
    payment_status: str | None
    processing_status: str | None
    source: str
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)
