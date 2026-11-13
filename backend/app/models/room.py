from datetime import datetime
from typing import TYPE_CHECKING

from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Index, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.electricity_reading import ElectricityReading
    from app.models.user_room import UserRoom


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("campus_param", "building_param", "room_number", name="uq_room_location"),
        Index("ix_rooms_provider_room_key", "provider", "provider_room_key"),
        Index("ix_rooms_provider_probe_only", "provider", "probe_only"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campus: Mapped[str] = mapped_column(String(80), default="青岛校区")
    campus_param: Mapped[str] = mapped_column(String(160), default="青岛校区&青岛校区")
    building_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    building_name: Mapped[str] = mapped_column(String(120))
    building_param: Mapped[str] = mapped_column(String(180))
    room_number: Mapped[str] = mapped_column(String(40), index=True)
    provider: Mapped[str] = mapped_column(String(20), default="mcard", index=True)
    provider_room_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    provider_line_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    provider_campus: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_building: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_floor: Mapped[str | None] = mapped_column(String(40), nullable=True)
    provider_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    provider_price_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Rooms created only for an administrator's HWGL probe must never become
    # visible in the public room directory or be picked up by normal sync.
    probe_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    readings: Mapped[list["ElectricityReading"]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
    )
    user_rooms: Mapped[list["UserRoom"]] = relationship(back_populates="room", cascade="all, delete-orphan")
