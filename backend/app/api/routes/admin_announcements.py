from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_admin, db_session
from app.api.routes.admin_common import audit
from app.models.admin_user import AdminUser
from app.models.announcement import Announcement
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut, AnnouncementUpdate

router = APIRouter()


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[Announcement]:
    return list(db.scalars(select(Announcement).order_by(Announcement.created_at.desc(), Announcement.id.desc())))


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementCreate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> Announcement:
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=422, detail="title and content cannot be blank")
    now = datetime.now(timezone.utc) if payload.is_published else None
    announcement = Announcement(
        title=title,
        content=content,
        is_published=payload.is_published,
        visibility=payload.visibility,
        published_at=now,
    )
    db.add(announcement)
    db.flush()
    audit(db, admin, "create_announcement", "announcement", announcement.id, {"title": announcement.title})
    db.commit()
    db.refresh(announcement)
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> Announcement:
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status_code=404, detail="announcement not found")
    changed = list(payload.model_fields_set)
    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="title cannot be blank")
        announcement.title = title
    if payload.content is not None:
        content = payload.content.strip()
        if not content:
            raise HTTPException(status_code=422, detail="content cannot be blank")
        announcement.content = content
    if payload.is_published is not None:
        if payload.is_published and not announcement.is_published:
            announcement.published_at = datetime.now(timezone.utc)
        announcement.is_published = payload.is_published
    if payload.visibility is not None:
        announcement.visibility = payload.visibility
    audit(db, admin, "update_announcement", "announcement", announcement.id, {"fields": changed})
    db.commit()
    db.refresh(announcement)
    return announcement


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> None:
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status_code=404, detail="announcement not found")
    audit(db, admin, "delete_announcement", "announcement", announcement.id, {"title": announcement.title})
    db.delete(announcement)
    db.commit()
