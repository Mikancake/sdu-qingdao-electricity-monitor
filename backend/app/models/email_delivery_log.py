from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmailDeliveryLog(Base):
    __tablename__ = "email_delivery_logs"
    __table_args__ = (Index("ix_email_delivery_logs_status_sent_at", "status", "sent_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    smtp_settings_id: Mapped[int | None] = mapped_column(
        ForeignKey("smtp_settings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notification_id: Mapped[int | None] = mapped_column(
        ForeignKey("notifications.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(40), default="send", index=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
