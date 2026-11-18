from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import db_session, verified_user
from app.schemas import DatabaseId
from app.core.config import settings
from app.core.security import credential_stamp, hash_password, sign_access_token, verify_password, verify_verification_code
from app.models.check_attempt import CheckAttempt
from app.models.email_verification_code import EmailVerificationCode
from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.auth import (
    DeleteAccountRequest,
    NotificationEmailRequest,
    NotificationEmailVerifyRequest,
    PasswordUpdateRequest,
    TestEmailOut,
    TokenOut,
    UserOut,
    UserPreferencesUpdate,
    VerificationCodeOut,
)
from app.schemas.dashboard import UserRoomDashboardOut, UsageStatsOut
from app.schemas.binding import UserRoomCreate, UserRoomOut, UserRoomUpdate
from app.schemas.reading import CheckAttemptOut, ElectricityReadingOut, ElectricityRechargeOut
from app.schemas.runtime import RuntimeLimitsOut
from app.api.routes.auth import (
    consume_verification_code,
    create_verification_code,
    deliver_verification_code,
    ensure_email_shape,
    ensure_verification_email_not_cooling,
    mark_verification_email_delivered,
    normalize_email,
)
from app.services.room_checks import check_and_store_room
from app.services.electricity_queries import (
    apply_query_resolution,
    execute_room_query,
    reading_from_query,
)
from app.services.notifications import send_test_email_for_user
from app.services.rate_limit import (
    account_rate_limit_key,
    client_rate_limit_key,
    enforce_rate_limit,
    rate_limit_key,
)
from app.services.rooms import RoomInputError, normalize_room_data
from app.services.runtime_settings import get_runtime_config
from app.services.usage import get_room_usage_stats, list_room_readings
from app.services.users import delete_user_account


router = APIRouter()
TEST_EMAIL_COOLDOWN = timedelta(minutes=30)
RECENT_RECHARGE_LIMIT = 12
ROOM_LOCATION_FIELDS = {"campus", "campus_param", "building_key", "building_name", "building_param", "room_number"}


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


def public_room_check_error(error_kind: str | None) -> tuple[int, dict[str, str]]:
    if error_kind == "token":
        return 503, {
            "kind": "room_check_unavailable",
            "message": "当前暂无可用的电量查询服务，请稍后再试。",
        }
    if error_kind in {"auth", "network", "timeout", "http", "api"}:
        return 502, {
            "kind": "room_check_unavailable",
            "message": "电量查询服务暂时不可用，请稍后再试。",
        }
    if error_kind in {"parse", "room_not_found", "room_ambiguous", "no_reading"}:
        return 422, {
            "kind": "room_not_found",
            "message": "没有查询到这个宿舍的电量，请检查宿舍楼和宿舍号是否正确。",
        }
    return 502, {
        "kind": "room_check_failed",
        "message": "电量查询失败，请稍后再试。",
    }


@router.get("/runtime-limits", response_model=RuntimeLimitsOut)
def get_runtime_limits(
    _: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> RuntimeLimitsOut:
    runtime = get_runtime_config(db)
    return RuntimeLimitsOut(
        manual_check_cooldown_seconds=runtime.manual_check_cooldown_seconds,
        notify_cooldown_hours=runtime.notify_cooldown_hours,
        max_rooms_per_user=runtime.max_rooms_per_user,
    )


def ensure_user_config_not_below_global(db: Session, *, notify_cooldown_hours: int | None = None) -> None:
    runtime = get_runtime_config(db)
    if notify_cooldown_hours is not None and notify_cooldown_hours < runtime.notify_cooldown_hours:
        raise HTTPException(
            status_code=422,
            detail=f"notification cooldown cannot be lower than global default {runtime.notify_cooldown_hours}h",
        )


def room_candidate(db: Session, data: dict) -> Room:
    try:
        room_data = normalize_room_data(data)
    except RoomInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    stmt = select(Room).where(
        Room.campus_param == room_data["campus_param"],
        Room.building_param == room_data["building_param"],
        Room.room_number == room_data["room_number"],
    )
    room = db.scalar(stmt)
    return room if room is not None else Room(**room_data)


def validate_and_record_room(db: Session, room: Room, *, source: str) -> None:
    # Token reservation writes through a separate session. Do not insert a
    # new room (or promote a probe) before this call: SQLite has one writer.
    result = execute_room_query(room, source=source).result
    if result.success and result.balance is not None:
        apply_query_resolution(room, result)
        room.probe_only = False
        db.add(room)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="room location changed; please retry") from exc
        db.add(reading_from_query(room.id, result, source=source))
        return

    status_code, detail = public_room_check_error(result.error_kind)
    raise HTTPException(status_code=status_code, detail=detail)


def get_my_binding(db: Session, user: User, binding_id: int, *, for_update: bool = False) -> UserRoom:
    stmt = (
        select(UserRoom)
        .options(selectinload(UserRoom.room))
        .where(UserRoom.id == binding_id, UserRoom.user_id == user.id)
    )
    if for_update:
        stmt = stmt.with_for_update()
    binding = db.scalar(stmt)
    if binding is None:
        raise HTTPException(status_code=404, detail="room binding not found")
    return binding


def get_manual_check_available_at(db: Session, binding: UserRoom) -> datetime | None:
    runtime = get_runtime_config(db)
    cooldown_seconds = (
        binding.manual_check_cooldown_seconds
        if binding.manual_check_cooldown_seconds is not None
        else binding.user.manual_check_cooldown_seconds
        if binding.user is not None and binding.user.manual_check_cooldown_seconds is not None
        else runtime.manual_check_cooldown_seconds
    )
    if cooldown_seconds <= 0:
        return None
    last_success_at = db.scalar(
        select(CheckAttempt.finished_at)
        .where(
            CheckAttempt.user_room_id == binding.id,
            CheckAttempt.source == "user",
            CheckAttempt.success.is_(True),
            CheckAttempt.finished_at.is_not(None),
        )
        .order_by(CheckAttempt.finished_at.desc())
        .limit(1)
    )
    if last_success_at is None:
        return None
    available_at = last_success_at + timedelta(seconds=cooldown_seconds)
    now = now_like(available_at)
    return available_at if now < available_at else None


def build_dashboard_item(db: Session, binding: UserRoom, *, limit: int = 24) -> UserRoomDashboardOut:
    stats, readings = get_room_usage_stats(
        db,
        binding.room_id,
        alert_days=binding.alert_days,
        alert_threshold_mode=binding.alert_threshold_mode,
        fixed_threshold=binding.low_power_threshold,
        provider=binding.room.provider,
    )
    recent_readings = list(reversed(readings[-limit:]))
    recent_recharges = list_room_recharges(db, binding, limit=RECENT_RECHARGE_LIMIT)
    return UserRoomDashboardOut(
        binding_id=binding.id,
        room=binding.room,
        alert_days=binding.alert_days,
        alert_threshold_mode=binding.alert_threshold_mode,
        low_power_threshold=binding.low_power_threshold,
        enabled=binding.enabled,
        manual_check_available_at=get_manual_check_available_at(db, binding),
        usage=UsageStatsOut(**stats.__dict__),
        recent_readings=recent_readings,
        recent_recharges=recent_recharges,
    )


def list_room_recharges(
    db: Session,
    binding: UserRoom,
    *,
    limit: int = RECENT_RECHARGE_LIMIT,
    days: int | None = None,
) -> list[ElectricityRecharge]:
    """Return only the recharge records belonging to one user's binding.

    HWGL is the only provider that currently exposes recharge history.  The
    provider filter is intentional: it prevents a future migration from
    accidentally mixing records from another provider into this response.
    """
    if binding.room is None or binding.room.provider != "hwgl":
        return []
    # Older installations may be upgraded before the recharge migration is
    # applied.  The dashboard should remain usable while that table is absent.
    if not inspect(db.connection()).has_table(ElectricityRecharge.__tablename__):
        return []
    runtime = get_runtime_config(db)
    effective_days = days if days is not None else runtime.hwgl_recharge_history_days
    stmt = (
        select(ElectricityRecharge)
        .where(
            ElectricityRecharge.room_id == binding.room_id,
            ElectricityRecharge.provider == binding.room.provider,
        )
        .order_by(ElectricityRecharge.paid_at.desc(), ElectricityRecharge.id.desc())
        .limit(max(1, min(limit, 500)))
    )
    if effective_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, effective_days))
        stmt = stmt.where(
            (ElectricityRecharge.paid_at.is_(None)) | (ElectricityRecharge.paid_at >= cutoff)
        )
    return list(db.scalars(stmt))


@router.get("/rooms", response_model=list[UserRoomOut])
def list_my_rooms(
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[UserRoom]:
    stmt = (
        select(UserRoom)
        .options(selectinload(UserRoom.room))
        .where(UserRoom.user_id == user.id)
        .order_by(UserRoom.id)
    )
    return list(db.scalars(stmt))


@router.get("/rooms/summary", response_model=list[UserRoomDashboardOut])
def list_my_room_summaries(
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[UserRoomDashboardOut]:
    stmt = (
        select(UserRoom)
        .options(selectinload(UserRoom.room))
        .where(UserRoom.user_id == user.id)
        .order_by(UserRoom.id)
    )
    return [build_dashboard_item(db, binding) for binding in db.scalars(stmt)]


def enforce_room_validation_limit(request: Request, user: User) -> None:
    enforce_rate_limit(rate_limit_key(request, "me:bind-room", user.id), limit=10, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("me:bind-room", user.id), limit=10, window_seconds=60 * 60)


def ensure_binding_capacity(db: Session, user_id: int, limit: int, *, additional: int = 1) -> None:
    count = db.scalar(select(func.count(UserRoom.id)).where(UserRoom.user_id == user_id)) or 0
    if count + additional > limit:
        raise HTTPException(
            status_code=422,
            detail={
                "kind": "room_bind_limit",
                "message": f"最多只能绑定 {limit} 个宿舍",
                "max_rooms_per_user": limit,
            },
        )


@router.post("/rooms", response_model=UserRoomOut, status_code=status.HTTP_201_CREATED)
def bind_my_room(
    request: Request,
    payload: UserRoomCreate,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> UserRoom:
    enforce_room_validation_limit(request, user)
    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=401, detail="user not found")
    runtime = get_runtime_config(db)
    ensure_binding_capacity(db, user.id, runtime.max_rooms_per_user)
    room = room_candidate(db, payload.model_dump())
    existing_binding_id = db.scalar(
        select(UserRoom.id).where(UserRoom.user_id == user.id, UserRoom.room_id == room.id).limit(1)
    )
    if existing_binding_id is not None:
        raise HTTPException(status_code=409, detail="room already bound")
    validate_and_record_room(db, room, source="bind")
    binding = UserRoom(
        user_id=user.id,
        room_id=room.id,
        alert_days=payload.alert_days,
        alert_threshold_mode=payload.alert_threshold_mode,
        low_power_threshold=payload.low_power_threshold,
        enabled=True,
    )
    db.add(binding)
    try:
        if db.get_bind().dialect.name == "sqlite":
            # SELECT FOR UPDATE is ignored on SQLite. Recheck once the
            # binding is flushed and this transaction owns the write lock.
            db.flush()
            ensure_binding_capacity(db, user.id, runtime.max_rooms_per_user, additional=0)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="room already bound") from exc
    stmt = select(UserRoom).options(selectinload(UserRoom.room)).where(UserRoom.id == binding.id)
    return db.scalar(stmt)


@router.get("/rooms/{binding_id}/summary", response_model=UserRoomDashboardOut)
def get_my_room_summary(
    binding_id: DatabaseId,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> UserRoomDashboardOut:
    binding = get_my_binding(db, user, binding_id)
    return build_dashboard_item(db, binding)


@router.post("/rooms/{binding_id}/check", response_model=ElectricityReadingOut)
def check_my_room(
    request: Request,
    binding_id: DatabaseId,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> ElectricityReading:
    binding = get_my_binding(db, user, binding_id, for_update=True)
    enforce_rate_limit(rate_limit_key(request, "me:manual-check", user.id, binding.id), limit=20, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("me:manual-check", user.id), limit=60, window_seconds=60 * 60)
    available_at = get_manual_check_available_at(db, binding)
    if available_at is not None:
        now = now_like(available_at)
        retry_after_seconds = max(1, int((available_at - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail={
                "kind": "manual_check_cooldown",
                "message": "manual check is cooling down",
                "retry_after_seconds": retry_after_seconds,
                "available_at": available_at.isoformat(),
            },
        )
    outcome = check_and_store_room(db, binding.room, source="user", user_id=user.id, user_room_id=binding.id)
    if not outcome.success or outcome.reading_id is None:
        status_code, detail = public_room_check_error(outcome.error_kind)
        raise HTTPException(status_code=status_code, detail=detail)
    reading = db.get(ElectricityReading, outcome.reading_id)
    if reading is None:
        raise HTTPException(status_code=500, detail="reading was not saved")
    return reading


@router.get("/rooms/{binding_id}/readings", response_model=list[ElectricityReadingOut])
def list_my_room_readings(
    binding_id: DatabaseId,
    limit: int = Query(default=500, ge=1, le=5000),
    days: int | None = Query(default=None, ge=1, le=365),
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[ElectricityReading]:
    binding = get_my_binding(db, user, binding_id)
    effective_days = None if start_at or end_at else days
    return list_room_readings(
        db,
        binding.room_id,
        provider=binding.room.provider,
        days=effective_days,
        start_at=start_at,
        end_at=end_at,
        limit=limit,
        ascending=True,
    )


@router.get("/readings", response_model=list[ElectricityReadingOut])
def list_all_my_readings(
    limit: int = Query(default=500, ge=1, le=5000),
    days: int | None = Query(default=None, ge=1, le=365),
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[ElectricityReading]:
    stmt = (
        select(ElectricityReading)
        .join(UserRoom, UserRoom.room_id == ElectricityReading.room_id)
        .join(Room, Room.id == ElectricityReading.room_id)
        .where(
            UserRoom.user_id == user.id,
            ElectricityReading.provider == Room.provider,
        )
        .order_by(
            func.coalesce(ElectricityReading.provider_updated_at, ElectricityReading.read_at).desc(),
            ElectricityReading.read_at.desc(),
            ElectricityReading.id.desc(),
        )
        .limit(limit)
    )
    data_at = func.coalesce(ElectricityReading.provider_updated_at, ElectricityReading.read_at)
    if days is not None and start_at is None and end_at is None:
        stmt = stmt.where(data_at >= datetime.now() - timedelta(days=days))
    if start_at is not None:
        stmt = stmt.where(data_at >= start_at)
    if end_at is not None:
        stmt = stmt.where(data_at <= end_at)
    return list(db.scalars(stmt))


@router.get("/rooms/{binding_id}/recharges", response_model=list[ElectricityRechargeOut])
def list_my_room_recharges(
    binding_id: DatabaseId,
    limit: int = Query(default=50, ge=1, le=500),
    days: int | None = Query(default=None, ge=1, le=730),
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[ElectricityRecharge]:
    binding = get_my_binding(db, user, binding_id)
    return list_room_recharges(db, binding, limit=limit, days=days)


@router.get("/check-attempts", response_model=list[CheckAttemptOut])
def list_my_check_attempts(
    limit: int = Query(default=200, ge=1, le=2000),
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> list[CheckAttemptOut]:
    room_ids = select(UserRoom.room_id).where(UserRoom.user_id == user.id)
    stmt = (
        select(CheckAttempt)
        .options(selectinload(CheckAttempt.room))
        .where(
            CheckAttempt.room_id.in_(room_ids),
            (CheckAttempt.user_id == user.id)
            | (
                CheckAttempt.source.in_(("worker", "admin", "cli"))
                & CheckAttempt.user_id.is_(None)
                & CheckAttempt.user_room_id.is_(None)
            ),
        )
        .order_by(CheckAttempt.started_at.desc(), CheckAttempt.id.desc())
        .limit(limit)
    )
    attempts = list(db.scalars(stmt))
    return [
        CheckAttemptOut.model_validate(attempt).model_copy(
            update={"error_msg": public_room_check_error(attempt.error_kind)[1]["message"]}
        )
        if not attempt.success
        else CheckAttemptOut.model_validate(attempt)
        for attempt in attempts
    ]


@router.patch("/preferences", response_model=UserOut)
def update_my_preferences(
    payload: UserPreferencesUpdate,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> User:
    if "notify_cooldown_hours" in payload.model_fields_set:
        ensure_user_config_not_below_global(db, notify_cooldown_hours=payload.notify_cooldown_hours)
        user.notify_cooldown_hours = payload.notify_cooldown_hours
    if payload.daily_report_enabled is not None:
        user.daily_report_enabled = payload.daily_report_enabled
    if payload.daily_report_interval_days is not None:
        user.daily_report_interval_days = payload.daily_report_interval_days
    db.commit()
    db.refresh(user)
    return user


@router.post("/test-email", response_model=TestEmailOut)
def send_my_test_email(
    request: Request,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> TestEmailOut:
    enforce_rate_limit(rate_limit_key(request, "me:test-email", user.id), limit=6, window_seconds=60 * 60)
    now = now_like(user.test_email_sent_at)
    if user.test_email_sent_at is not None:
        available_at = user.test_email_sent_at + TEST_EMAIL_COOLDOWN
        if now < available_at:
            raise HTTPException(
                status_code=429,
                detail={
                    "kind": "test_email_cooldown",
                    "message": "test email is cooling down",
                    "retry_after_seconds": max(1, int((available_at - now).total_seconds())),
                    "available_at": available_at.isoformat(),
                },
            )

    result = send_test_email_for_user(db, user)
    if not result.ok:
        raise HTTPException(status_code=502, detail="test email could not be sent; check the SMTP health log")
    user.test_email_sent_at = datetime.now()
    db.commit()
    return TestEmailOut(email=user.notification_recipient_email, email_sent=True)


def notification_code_purpose(user: User) -> str:
    # Fits the existing 40-character purpose column. Bind to the credentials
    # as well as the id (SQLite may reuse an id after account deletion).
    return "notify:" + credential_stamp(f"notify:{user.id}:{user.password_hash}")[:32]


@router.post("/notification-email/request-code", response_model=VerificationCodeOut)
def request_notification_email_code(
    request: Request,
    payload: NotificationEmailRequest,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> VerificationCodeOut:
    email = normalize_email(payload.email)
    ensure_email_shape(email)
    enforce_rate_limit(client_rate_limit_key(request, "me:notification-email-code"), limit=50, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("me:notification-email-code", user.id), limit=10, window_seconds=60 * 60)
    enforce_rate_limit(rate_limit_key(request, "me:notification-email-code", user.id, email), limit=6, window_seconds=60 * 60)
    ensure_verification_email_not_cooling(db, email, "notification_email")
    record, code = create_verification_code(db, email, purpose=notification_code_purpose(user))
    db.commit()
    email_sent = deliver_verification_code(email, code)
    mark_verification_email_delivered(db, record, email_sent)
    return VerificationCodeOut(email=email, dev_verification_code=code if settings.debug else None, email_sent=email_sent)


@router.post("/notification-email/verify", response_model=UserOut)
def verify_notification_email(
    request: Request,
    payload: NotificationEmailVerifyRequest,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> User:
    email = normalize_email(payload.email)
    ensure_email_shape(email)
    enforce_rate_limit(account_rate_limit_key("me:notification-email-verify", user.id), limit=20, window_seconds=15 * 60)
    enforce_rate_limit(rate_limit_key(request, "me:notification-email-verify", user.id, email), limit=20, window_seconds=15 * 60)
    now = datetime.now()
    stmt = (
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == notification_code_purpose(user),
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.expires_at >= now,
        )
        .order_by(EmailVerificationCode.created_at.desc(), EmailVerificationCode.id.desc())
        .limit(5)
    )
    records = list(db.scalars(stmt))
    matched = next((record for record in records if verify_verification_code(payload.code, record.code_hash)), None)
    if matched is None:
        raise HTTPException(status_code=400, detail="invalid or expired verification code")

    consume_verification_code(db, matched)
    user.notification_email = email
    user.notification_email_verified_at = now
    db.commit()
    db.refresh(user)
    return user


@router.patch("/rooms/{binding_id}", response_model=UserRoomOut)
def update_my_room_binding(
    request: Request,
    binding_id: DatabaseId,
    payload: UserRoomUpdate,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> UserRoom:
    binding = get_my_binding(db, user, binding_id)
    if ROOM_LOCATION_FIELDS & payload.model_fields_set:
        building_key_changed = "building_key" in payload.model_fields_set
        room_payload = {
            "campus": payload.campus if "campus" in payload.model_fields_set and payload.campus is not None else binding.room.campus,
            "campus_param": (
                payload.campus_param
                if "campus_param" in payload.model_fields_set and payload.campus_param is not None
                else binding.room.campus_param
            ),
            "room_number": (
                payload.room_number
                if "room_number" in payload.model_fields_set and payload.room_number is not None
                else binding.room.room_number
            ),
        }
        if building_key_changed:
            room_payload["building_key"] = payload.building_key
            if "building_name" in payload.model_fields_set:
                room_payload["building_name"] = payload.building_name
            if "building_param" in payload.model_fields_set:
                room_payload["building_param"] = payload.building_param
        else:
            room_payload["building_key"] = binding.room.building_key
            room_payload["building_name"] = (
                payload.building_name
                if "building_name" in payload.model_fields_set and payload.building_name is not None
                else binding.room.building_name
            )
            room_payload["building_param"] = (
                payload.building_param
                if "building_param" in payload.model_fields_set and payload.building_param is not None
                else binding.room.building_param
            )
        room = room_candidate(db, room_payload)
        existing_binding_id = db.scalar(
            select(UserRoom.id)
            .where(UserRoom.user_id == user.id, UserRoom.room_id == room.id, UserRoom.id != binding.id)
            .limit(1)
        )
        if existing_binding_id is not None:
            raise HTTPException(status_code=409, detail="room already bound")
        if room.id != binding.room_id:
            enforce_room_validation_limit(request, user)
            validate_and_record_room(db, room, source="room_update")
            binding.room = room
    if payload.alert_days is not None:
        binding.alert_days = payload.alert_days
    if payload.alert_threshold_mode is not None:
        binding.alert_threshold_mode = payload.alert_threshold_mode
    if "low_power_threshold" in payload.model_fields_set:
        binding.low_power_threshold = payload.low_power_threshold
    if "manual_check_cooldown_seconds" in payload.model_fields_set:
        runtime = get_runtime_config(db)
        if (
            payload.manual_check_cooldown_seconds is not None
            and payload.manual_check_cooldown_seconds < runtime.manual_check_cooldown_seconds
        ):
            raise HTTPException(
                status_code=422,
                detail=f"manual check cooldown cannot be lower than global default {runtime.manual_check_cooldown_seconds}s",
            )
        binding.manual_check_cooldown_seconds = payload.manual_check_cooldown_seconds
    if "notify_cooldown_hours" in payload.model_fields_set:
        ensure_user_config_not_below_global(db, notify_cooldown_hours=payload.notify_cooldown_hours)
        binding.notify_cooldown_hours = payload.notify_cooldown_hours
    if payload.enabled is not None:
        binding.enabled = payload.enabled
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="room already bound") from exc
    stmt = select(UserRoom).options(selectinload(UserRoom.room)).where(UserRoom.id == binding.id)
    updated = db.scalar(stmt)
    if updated is None:
        raise HTTPException(status_code=404, detail="room binding not found")
    return updated


@router.delete("/rooms/{binding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_room_binding(
    binding_id: DatabaseId,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> None:
    binding = db.scalar(select(UserRoom).where(UserRoom.id == binding_id, UserRoom.user_id == user.id))
    if binding is None:
        raise HTTPException(status_code=404, detail="room binding not found")
    db.delete(binding)
    db.commit()


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    request: Request,
    payload: DeleteAccountRequest,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> None:
    enforce_rate_limit(client_rate_limit_key(request, "me:delete-account"), limit=20, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("me:delete-account", user.id), limit=5, window_seconds=60 * 60)
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="password is incorrect")
    delete_user_account(db, user)
    db.commit()


@router.post("/password", response_model=TokenOut)
def update_my_password(
    request: Request,
    payload: PasswordUpdateRequest,
    user: User = Depends(verified_user),
    db: Session = Depends(db_session),
) -> TokenOut:
    enforce_rate_limit(client_rate_limit_key(request, "me:password"), limit=20, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("me:password", user.id), limit=5, window_seconds=60 * 60)
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="current password is incorrect")
    if payload.new_password == payload.old_password:
        raise HTTPException(status_code=422, detail="new password must be different")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return TokenOut(
        access_token=sign_access_token(user.id, kind="user", password_hash=user.password_hash),
        user=user,
    )
