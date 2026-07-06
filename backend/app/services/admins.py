from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.admin_user import AdminUser


def normalize_username(username: str) -> str:
    return username.strip().lower()


def ensure_initial_admin(db: Session) -> AdminUser | None:
    if not settings.initial_admin_username or not settings.initial_admin_password:
        return None

    username = normalize_username(settings.initial_admin_username)
    admin = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if admin is not None:
        return admin

    admin = AdminUser(
        username=username,
        password_hash=hash_password(settings.initial_admin_password),
        display_name=settings.initial_admin_display_name,
        enabled=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin
