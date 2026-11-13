from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.room import Room


class HwglProbeSession(Base):
    __tablename__ = "hwgl_probe_sessions"
    __table_args__ = (
        Index("ix_hwgl_probe_sessions_status_next_run", "status", "next_run_at"),
        Index("ix_hwgl_probe_sessions_room_created", "room_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    interval_seconds: Mapped[int] = mapped_column(Integer, default=60)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_snapshot_count: Mapped[int] = mapped_column(Integer, default=0)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    room: Mapped["Room"] = relationship()
    samples: Mapped[list["HwglProbeSample"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="HwglProbeSample.requested_at"
    )


class HwglProbeSample(Base):
    __tablename__ = "hwgl_probe_samples"
    __table_args__ = (
        Index("ix_hwgl_probe_samples_session_requested", "session_id", "requested_at"),
        Index("ix_hwgl_probe_samples_session_snapshot", "session_id", "response_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("hwgl_probe_sessions.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    provider_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    balance: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    reported_daily_usage: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    power_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    response_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    error_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["HwglProbeSession"] = relationship(back_populates="samples")
