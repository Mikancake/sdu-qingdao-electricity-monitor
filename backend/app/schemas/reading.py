from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ElectricityReadingOut(BaseModel):
    id: int
    room_id: int
    balance: Decimal
    source: str
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
    read_at: datetime

    model_config = ConfigDict(from_attributes=True)
