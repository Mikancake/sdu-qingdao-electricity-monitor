from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int] = mapped_column(Integer, default=465)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password: Mapped[str | None] = mapped_column(String(512), nullable=True)
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    use_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    use_starttls: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
