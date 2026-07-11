from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.auth_token import AuthToken


@dataclass(frozen=True)
class ReservedToken:
    id: int
    token_value: str


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


def select_available_token(db: Session) -> AuthToken | None:
    tokens = list(db.scalars(select(AuthToken).where(AuthToken.enabled.is_(True)).order_by(AuthToken.id)))
    candidates: list[tuple[tuple[int, float, int], int]] = []
    for token in tokens:
        if token.last_used_at is None:
            candidates.append(((0, 0.0, token.id), token.id))
            continue
        next_available_at = token.last_used_at + timedelta(seconds=token.min_interval_seconds)
        if next_available_at <= now_like(next_available_at):
            candidates.append(((1, next_available_at.timestamp(), token.id), token.id))

    for _, token_id in sorted(candidates):
        stmt = (
            select(AuthToken)
            .where(AuthToken.id == token_id, AuthToken.enabled.is_(True))
            .with_for_update(skip_locked=True)
            .execution_options(populate_existing=True)
        )
        token = db.scalar(stmt)
        if token is None:
            continue
        if token.last_used_at is not None:
            next_available_at = token.last_used_at + timedelta(seconds=token.min_interval_seconds)
            if next_available_at > now_like(next_available_at):
                continue
        token.last_used_at = now_like(token.last_used_at)
        db.flush()
        return token
    return None


def reserve_available_token() -> ReservedToken | None:
    """Atomically reserve a token in a short transaction before network I/O."""
    with SessionLocal() as db:
        token = select_available_token(db)
        if token is None:
            return None
        reserved = ReservedToken(id=token.id, token_value=token.token_value)
        db.commit()
        return reserved
