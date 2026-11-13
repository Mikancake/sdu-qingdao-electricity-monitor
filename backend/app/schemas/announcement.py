from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AnnouncementVisibility = Literal["public", "users"]


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=10000)
    is_published: bool = True
    visibility: AnnouncementVisibility = "users"


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    content: str | None = Field(default=None, min_length=1, max_length=10000)
    is_published: bool | None = None
    visibility: AnnouncementVisibility | None = None


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    is_published: bool
    visibility: AnnouncementVisibility
    created_at: datetime
    updated_at: datetime | None = None
    published_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
