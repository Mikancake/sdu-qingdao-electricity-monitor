from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.admin_user import AdminUser


INSECURE_INITIAL_ADMIN_PASSWORDS = {
    "change-this-admin-password",
    "admin",
    "password",
    "123456",
}


def normalize_username(username: str) -> str:
    return username.strip().lower()


def has_admin(db: Session) -> bool:
    return db.scalar(select(AdminUser.id).where(AdminUser.enabled.is_(True)).limit(1)) is not None


def validate_initial_admin_settings() -> None:
    if settings.debug or settings.allow_insecure_startup:
        return
    if not settings.initial_admin_username or not settings.initial_admin_password:
        raise RuntimeError(
            "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set when no admin account exists"
        )
    if settings.initial_admin_password in INSECURE_INITIAL_ADMIN_PASSWORDS or len(settings.initial_admin_password) < 8:
        raise RuntimeError(
            "INITIAL_ADMIN_PASSWORD must be changed to a non-default password of at least 8 characters "
            "when no admin account exists and APP_DEBUG=false"
        )


def ensure_initial_admin(db: Session) -> AdminUser | None:
    if has_admin(db):
        return None

    validate_initial_admin_settings()

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
