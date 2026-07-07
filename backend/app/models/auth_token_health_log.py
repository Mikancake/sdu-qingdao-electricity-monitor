from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthTokenHealthLog(Base):
    __tablename__ = "auth_token_health_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    auth_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("auth_tokens.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(40), default="check", index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    error_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_status: Mapped[str] = mapped_column(String(40), default="unknown", index=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
