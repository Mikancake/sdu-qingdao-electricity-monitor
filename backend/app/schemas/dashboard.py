from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.reading import RecentReadingOut
from app.schemas.room import RoomOut


class UsageStatsOut(BaseModel):
    latest_balance: Decimal | None
    latest_read_at: datetime | None
    average_daily_usage: Decimal | None
    days_remaining: Decimal | None
    alert_threshold: Decimal | None
    is_low_power: bool
    status: str


class UserRoomDashboardOut(BaseModel):
    binding_id: int
    room: RoomOut
    alert_days: int
    low_power_threshold: Decimal | None
    enabled: bool
    manual_check_available_at: datetime | None = None
    usage: UsageStatsOut
    recent_readings: list[RecentReadingOut]


class NotificationOut(BaseModel):
    id: int
    user_id: int
    room_id: int
    user_room_id: int
    reading_id: int | None
    kind: str
    status: str
    recipient_email: str
    subject: str
    body: str
    error_msg: str | None
    created_at: datetime
    sent_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
