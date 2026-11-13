from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.room import Room


class ElectricityRecharge(Base):
    """A normalized, privacy-safe copy of an upstream recharge record."""

    __tablename__ = "electricity_recharges"
    __table_args__ = (
        UniqueConstraint("room_id", "provider", "external_id_hash", name="uq_electricity_recharge_external"),
        Index("ix_electricity_recharges_room_paid_at", "room_id", "paid_at"),
        Index("ix_electricity_recharges_provider_status", "provider", "processing_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20), default="hwgl", index=True)
    external_id_hash: Mapped[str] = mapped_column(String(64))
    external_id_tail: Mapped[str | None] = mapped_column(String(12), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    line_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payment_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    processing_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="hwgl_recharge_sync")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    room: Mapped["Room"] = relationship()
