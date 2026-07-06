from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRoom(Base):
    __tablename__ = "user_rooms"
    __table_args__ = (UniqueConstraint("user_id", "room_id", name="uq_user_room"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    alert_days: Mapped[int] = mapped_column(Integer, default=3)
    low_power_threshold: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    manual_check_cooldown_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notify_cooldown_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="rooms")
    room: Mapped["Room"] = relationship(back_populates="user_rooms")
