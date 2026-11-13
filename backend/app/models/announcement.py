from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


# ``public`` announcements are also shown to visitors who are not signed in
# (registration/login screen); ``users`` announcements only appear after login.
ANNOUNCEMENT_VISIBILITY_PUBLIC = "public"
ANNOUNCEMENT_VISIBILITY_USERS = "users"
ANNOUNCEMENT_VISIBILITIES = (ANNOUNCEMENT_VISIBILITY_PUBLIC, ANNOUNCEMENT_VISIBILITY_USERS)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    visibility: Mapped[str] = mapped_column(
        String(20),
        default=ANNOUNCEMENT_VISIBILITY_USERS,
        server_default=ANNOUNCEMENT_VISIBILITY_USERS,
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
