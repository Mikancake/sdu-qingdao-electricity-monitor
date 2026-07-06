from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.room import RoomCreate, RoomOut


class UserRoomCreate(RoomCreate):
    alert_days: int = Field(default=3, ge=1, le=30)
    low_power_threshold: Decimal | None = Field(default=None, ge=0)


class UserRoomUpdate(BaseModel):
    alert_days: int | None = Field(default=None, ge=1, le=30)
    low_power_threshold: Decimal | None = Field(default=None, ge=0)
    manual_check_cooldown_seconds: int | None = Field(default=None, ge=0, le=60 * 60)
    notify_cooldown_hours: int | None = Field(default=None, ge=0, le=24 * 30)
    enabled: bool | None = None


class UserRoomOut(BaseModel):
    id: int
    room_id: int
    alert_days: int
    low_power_threshold: Decimal | None
    manual_check_cooldown_seconds: int | None
    notify_cooldown_hours: int | None
    enabled: bool
    created_at: datetime
    room: RoomOut

    model_config = ConfigDict(from_attributes=True)
