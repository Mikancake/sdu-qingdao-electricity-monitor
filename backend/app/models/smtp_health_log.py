from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SmtpHealthLog(Base):
    __tablename__ = "smtp_health_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    smtp_settings_id: Mapped[int | None] = mapped_column(
        ForeignKey("smtp_settings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(40), default="send", index=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    error_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_status: Mapped[str] = mapped_column(String(40), default="unknown", index=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
