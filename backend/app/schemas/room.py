from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reading import RecentReadingOut


class RoomCreate(BaseModel):
    campus: str = "\u9752\u5c9b\u6821\u533a"
    campus_param: str = "\u9752\u5c9b\u6821\u533a&\u9752\u5c9b\u6821\u533a"
    building_key: str | None = None
    building_name: str | None = Field(default=None, max_length=120)
    building_param: str | None = Field(default=None, max_length=180)
    room_number: str = Field(min_length=1, max_length=40)


class RoomOut(BaseModel):
    id: int
    campus: str
    campus_param: str
    building_key: str | None
    building_name: str
    building_param: str
    room_number: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomSummaryOut(BaseModel):
    room_id: int
    location: str
    latest_balance: Decimal | None
    latest_read_at: datetime | None
    reading_count: int
    recent_readings: list[RecentReadingOut]


class BuildingOut(BaseModel):
    key: str
    name: str
    param: str
