from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.admin_announcements import create_announcement, update_announcement
from app.api.routes.announcements import list_published_announcements
from app.db.base import Base
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.models.announcement import Announcement
from app.models.user import User
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate


def test_admin_publish_and_public_read_announcements() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[AdminUser.__table__, AdminAuditLog.__table__, Announcement.__table__])

    with Session(engine) as db:
        admin = AdminUser(username="smoke-admin", password_hash="x", enabled=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)

        published = create_announcement(
            AnnouncementCreate(
                title="  计划停电  ",
                content="  今晚维护  ",
                visibility="public",
            ),
            admin,
            db,
        )
        assert published.title == "计划停电"
        assert published.content == "今晚维护"
        assert published.published_at is not None

        draft = create_announcement(
            AnnouncementCreate(
                title="草稿",
                content="暂不展示",
                is_published=False,
                visibility="public",
            ),
            admin,
            db,
        )
        members_only = create_announcement(AnnouncementCreate(title="内部公告", content="仅登录可见"), admin, db)
        response = Response()
        assert [item.id for item in list_published_announcements(response, viewer=None, db=db)] == [published.id]
        assert "no-store" in response.headers["cache-control"]
        assert response.headers["vary"] == "Authorization"
        member = User(email="member@example.com", is_verified=True)
        assert {item.id for item in list_published_announcements(response, member, db)} == {published.id, members_only.id}

        update_announcement(draft.id, AnnouncementUpdate(is_published=True), admin, db)
        assert {item.id for item in list_published_announcements(response, viewer=None, db=db)} == {published.id, draft.id}
