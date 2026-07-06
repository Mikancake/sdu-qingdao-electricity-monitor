from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken


def select_available_token(db: Session) -> AuthToken | None:
    now = datetime.now()
    tokens = list(db.scalars(select(AuthToken).where(AuthToken.enabled.is_(True)).order_by(AuthToken.last_used_at, AuthToken.id)))
    for token in tokens:
        if token.last_used_at is None:
            return token
        next_available_at = token.last_used_at + timedelta(seconds=token.min_interval_seconds)
        if next_available_at <= now:
            return token
    return None
