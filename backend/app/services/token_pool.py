from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


def select_available_token(db: Session) -> AuthToken | None:
    tokens = list(db.scalars(select(AuthToken).where(AuthToken.enabled.is_(True)).order_by(AuthToken.last_used_at, AuthToken.id)))
    for token in tokens:
        if token.last_used_at is None:
            return token
        next_available_at = token.last_used_at + timedelta(seconds=token.min_interval_seconds)
        if next_available_at <= now_like(next_available_at):
            return token
    return None
