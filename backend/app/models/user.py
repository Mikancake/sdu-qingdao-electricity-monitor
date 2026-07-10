from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user_room import UserRoom


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    notification_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    notification_email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    manual_check_cooldown_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notify_cooldown_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    daily_report_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_report_interval_days: Mapped[int] = mapped_column(Integer, default=1)
    daily_report_last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rooms: Mapped[list["UserRoom"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @property
    def notification_email_verified(self) -> bool:
        return bool(self.notification_email and self.notification_email_verified_at)

    @property
    def notification_recipient_email(self) -> str:
        if self.notification_email_verified and self.notification_email:
            return self.notification_email
        return self.email
