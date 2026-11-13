from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import db_session, optional_user
from app.models.announcement import (
    ANNOUNCEMENT_VISIBILITY_PUBLIC,
    ANNOUNCEMENT_VISIBILITY_USERS,
    Announcement,
)
from app.models.user import User
from app.schemas.announcement import AnnouncementOut

router = APIRouter()


@router.get("", response_model=list[AnnouncementOut])
def list_published_announcements(
    viewer: User | None = Depends(optional_user),
    db: Session = Depends(db_session),
) -> list[Announcement]:
    """Published announcements visible to the caller.

    Visitors who are not signed in only receive ``public`` announcements; a
    signed-in user also receives the login-only ones.
    """
    stmt = (
        select(Announcement)
        .where(Announcement.is_published.is_(True))
        .order_by(Announcement.published_at.desc(), Announcement.created_at.desc(), Announcement.id.desc())
        .limit(10)
    )
    if viewer is None:
        stmt = stmt.where(Announcement.visibility == ANNOUNCEMENT_VISIBILITY_PUBLIC)
    else:
        stmt = stmt.where(
            or_(
                Announcement.visibility == ANNOUNCEMENT_VISIBILITY_PUBLIC,
                Announcement.visibility == ANNOUNCEMENT_VISIBILITY_USERS,
            )
        )
    return list(db.scalars(stmt))
