from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.electricity_reading import ElectricityReading
    from app.models.user_room import UserRoom


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("campus_param", "building_param", "room_number", name="uq_room_location"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campus: Mapped[str] = mapped_column(String(80), default="青岛校区")
    campus_param: Mapped[str] = mapped_column(String(160), default="青岛校区&青岛校区")
    building_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    building_name: Mapped[str] = mapped_column(String(120))
    building_param: Mapped[str] = mapped_column(String(180))
    room_number: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    readings: Mapped[list["ElectricityReading"]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
    )
    user_rooms: Mapped[list["UserRoom"]] = relationship(back_populates="room", cascade="all, delete-orphan")
