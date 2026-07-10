from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.room import Room


class CheckAttempt(Base):
    __tablename__ = "check_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_room_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    auth_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("auth_tokens.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reading_id: Mapped[int | None] = mapped_column(
        ForeignKey("electricity_readings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(40), default="worker", index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    balance: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    error_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped["Room"] = relationship()
