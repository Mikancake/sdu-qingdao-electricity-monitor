import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.electricity.client import CampusElectricityClient
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.runtime_settings import get_runtime_config
from app.services.token_pool import select_available_token


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


@dataclass(frozen=True)
class RoomCheckOutcome:
    room_id: int
    success: bool
    reading_id: int | None = None
    balance: str | None = None
    error_kind: str | None = None
    error_msg: str | None = None


@dataclass(frozen=True)
class RoomCheckBatchResult:
    checked: int
    succeeded: int
    failed: int
    outcomes: list[RoomCheckOutcome] = field(default_factory=list)


def check_and_store_room(
    db: Session,
    room: Room,
    *,
    source: str = "manual",
    user_id: int | None = None,
    user_room_id: int | None = None,
) -> RoomCheckOutcome:
    attempt = CheckAttempt(
        room_id=room.id,
        user_id=user_id,
        user_room_id=user_room_id,
        source=source,
        success=False,
        started_at=datetime.now(),
    )
    db.add(attempt)
    db.flush()

    token = select_available_token(db)
    if token is None:
        attempt.error_kind = "token"
        attempt.error_msg = "no enabled auth token"
        attempt.finished_at = datetime.now()
        db.commit()
        return RoomCheckOutcome(room_id=room.id, success=False, error_kind="token", error_msg="no enabled auth token")

    attempt.auth_token_id = token.id
    result = CampusElectricityClient(token.token_value).query_room(room)
    token.last_used_at = datetime.now()
    if not result.success or result.balance is None:
        attempt.error_kind = result.error_kind
        attempt.error_msg = result.error_msg
        attempt.finished_at = datetime.now()
        db.commit()
        return RoomCheckOutcome(
            room_id=room.id,
            success=False,
            error_kind=result.error_kind,
            error_msg=result.error_msg,
        )

    reading = ElectricityReading(room_id=room.id, balance=result.balance, source=source)
    db.add(reading)
    db.flush()
    attempt.success = True
    attempt.reading_id = reading.id
    attempt.balance = result.balance
    attempt.finished_at = datetime.now()
    db.commit()
    db.refresh(reading)
    return RoomCheckOutcome(
        room_id=room.id,
        success=True,
        reading_id=reading.id,
        balance=str(reading.balance),
    )


def latest_read_at(db: Session, room_id: int) -> datetime | None:
    return db.scalar(
        select(ElectricityReading.read_at)
        .where(ElectricityReading.room_id == room_id)
        .order_by(ElectricityReading.read_at.desc())
        .limit(1)
    )


def bound_room_statement():
    return (
        select(Room)
        .join(UserRoom, UserRoom.room_id == Room.id)
        .join(User, User.id == UserRoom.user_id)
        .where(UserRoom.enabled.is_(True), User.is_verified.is_(True))
        .distinct()
        .order_by(Room.id)
    )


def list_due_rooms(db: Session, *, limit: int | None = None) -> list[Room]:
    runtime = get_runtime_config(db)
    interval = timedelta(seconds=runtime.check_interval_seconds)
    rooms = list(db.scalars(bound_room_statement()))
    due: list[Room] = []
    for room in rooms:
        last_read_at = latest_read_at(db, room.id)
        if last_read_at is None:
            due.append(room)
        else:
            cutoff = now_like(last_read_at) - interval
            if last_read_at <= cutoff:
                due.append(room)
        if limit is not None and len(due) >= limit:
            break
    return due


def run_room_checks(
    *,
    check_all: bool = False,
    limit: int | None = None,
    delay_seconds: float | None = None,
    source: str = "worker",
    use_batch_limit: bool = True,
) -> RoomCheckBatchResult:
    outcomes: list[RoomCheckOutcome] = []
    fallback_limit = settings.check_batch_size

    with SessionLocal() as db:
        runtime = get_runtime_config(db)
        effective_limit = limit if limit is not None else runtime.check_batch_size or fallback_limit
        delay = runtime.check_request_delay_seconds if delay_seconds is None else delay_seconds
        if check_all:
            stmt = bound_room_statement()
            if use_batch_limit:
                stmt = stmt.limit(effective_limit)
            rooms = list(db.scalars(stmt))
        else:
            rooms = list_due_rooms(db, limit=effective_limit)

        for index, room in enumerate(rooms):
            outcomes.append(check_and_store_room(db, room, source=source))
            if delay > 0 and index < len(rooms) - 1:
                time.sleep(delay)

    succeeded = sum(1 for outcome in outcomes if outcome.success)
    failed = len(outcomes) - succeeded
    return RoomCheckBatchResult(checked=len(outcomes), succeeded=succeeded, failed=failed, outcomes=outcomes)
