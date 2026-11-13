from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.room import Room


class ElectricityReading(Base):
    __tablename__ = "electricity_readings"
    __table_args__ = (
        Index("ix_electricity_readings_room_read_at", "room_id", "read_at"),
        Index("ix_electricity_readings_room_provider_updated", "room_id", "provider_updated_at"),
        Index("ix_electricity_readings_room_reported_date", "room_id", "reported_usage_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    source: Mapped[str] = mapped_column(String(40), default="manual")
    provider: Mapped[str] = mapped_column(String(20), default="mcard", index=True)
    provider_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reported_daily_usage: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    reported_usage_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    power_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    free_electricity: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    paid_electricity: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    arrears_electricity: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    electricity_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped["Room"] = relationship(back_populates="readings")
