from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import current_admin, db_session
from app.api.routes import admin_appearance, admin_logs, admin_rooms, admin_status
from app.api.routes.admin_common import audit, next_smtp_id, smtp_out, token_out
from app.api.routes.auth import ensure_email_shape, normalize_email
from app.core.security import DUMMY_PASSWORD_HASH, hash_password, password_needs_rehash, sign_access_token, verify_password
from app.electricity.client import CampusElectricityClient
from app.models.admin_user import AdminUser
from app.models.auth_token import AuthToken
from app.models.room import Room
from app.models.smtp_settings import SmtpSettings
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import (
    AdminAuthTokenCreate,
    AdminAuthTokenOut,
    AdminAuthTokenUpdate,
    AdminHealthTestOut,
    AdminTokenHealthTestRequest,
    AdminLogin,
    AdminManagedUserDetailOut,
    AdminManagedUserOut,
    AdminManagedUserPageOut,
    AdminManagedUserRoomUpdate,
    AdminManagedUserUpdate,
    AdminPasswordUpdate,
    AdminProfileUpdate,
    AdminTokenOut,
    AdminUserOut,
    DataRetentionCleanupOut,
    RateLimitClearOut,
    RateLimitClearRequest,
    RuntimeSettingsOut,
    RuntimeSettingsUpdate,
    SmtpSettingsCreate,
    SmtpSettingsOut,
    SmtpSettingsUpdate,
    SmtpTestRequest,
)
from app.schemas.binding import UserRoomOut
from app.services.admins import normalize_username
from app.services.data_retention import cleanup_data_retention
from app.services.emailer import send_email
from app.services.notifications import run_low_power_notifications
from app.services.rate_limit import account_rate_limit_key, client_rate_limit_key, enforce_rate_limit, limiter
from app.services.room_checks import run_room_checks
from app.services.runtime_settings import get_runtime_config, update_runtime_config
from app.services.token_health import record_token_health
from app.services.users import delete_user_account


router = APIRouter()
router.include_router(admin_appearance.router)
router.include_router(admin_logs.router)
router.include_router(admin_rooms.router)
router.include_router(admin_status.router)


@router.post("/auth/login", response_model=AdminTokenOut)
def admin_login(request: Request, payload: AdminLogin, db: Session = Depends(db_session)) -> AdminTokenOut:
    username = normalize_username(payload.username)
    enforce_rate_limit(client_rate_limit_key(request, "admin:login"), limit=30, window_seconds=10 * 60)
    enforce_rate_limit(account_rate_limit_key("admin:login", username), limit=8, window_seconds=10 * 60)
    admin = db.scalar(select(AdminUser).where(AdminUser.username == username))
    password_hash = admin.password_hash if admin is not None else DUMMY_PASSWORD_HASH
    password_valid = verify_password(payload.password, password_hash)
    if admin is None or not admin.enabled or not password_valid:
        raise HTTPException(status_code=401, detail="invalid username or password")
    if password_needs_rehash(admin.password_hash):
        admin.password_hash = hash_password(payload.password)
    admin.last_login_at = datetime.now()
    db.commit()
    db.refresh(admin)
    return AdminTokenOut(
        access_token=sign_access_token(admin.id, kind="admin", password_hash=admin.password_hash),
        admin=admin,
    )


@router.get("/auth/me", response_model=AdminUserOut)
def get_admin_me(admin: AdminUser = Depends(current_admin)) -> AdminUser:
    return admin


@router.patch("/auth/me", response_model=AdminUserOut)
def update_admin_profile(
    payload: AdminProfileUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminUser:
    if "display_name" in payload.model_fields_set:
        admin.display_name = payload.display_name.strip() if payload.display_name else None
    audit(db, admin, "update_admin_profile", "admin_user", admin.id, {"fields": list(payload.model_fields_set)})
    db.commit()
    db.refresh(admin)
    return admin


@router.post("/auth/password", response_model=AdminTokenOut)
def update_admin_password(
    request: Request,
    payload: AdminPasswordUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminTokenOut:
    enforce_rate_limit(client_rate_limit_key(request, "admin:password"), limit=20, window_seconds=60 * 60)
    enforce_rate_limit(account_rate_limit_key("admin:password", admin.username), limit=5, window_seconds=60 * 60)
    if not verify_password(payload.old_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="old password is incorrect")
    if payload.new_password == payload.old_password:
        raise HTTPException(status_code=422, detail="new password must be different")
    admin.password_hash = hash_password(payload.new_password)
    audit(db, admin, "update_admin_password", "admin_user", admin.id)
    db.commit()
    db.refresh(admin)
    return AdminTokenOut(
        access_token=sign_access_token(admin.id, kind="admin", password_hash=admin.password_hash),
        admin=admin,
    )


def _managed_user_out(db: Session, user: User, *, room_count: int | None = None) -> AdminManagedUserOut:
    if room_count is None:
        room_count = db.scalar(select(func.count(UserRoom.id)).where(UserRoom.user_id == user.id)) or 0
    return AdminManagedUserOut(
        id=user.id,
        email=user.email,
        is_verified=user.is_verified,
        notification_email=user.notification_email,
        notification_email_verified=user.notification_email_verified,
        manual_check_cooldown_seconds=user.manual_check_cooldown_seconds,
        notify_cooldown_hours=user.notify_cooldown_hours,
        room_count=room_count,
        created_at=user.created_at,
    )


@router.get("/users", response_model=list[AdminManagedUserOut])
def list_users(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminManagedUserOut]:
    room_counts = (
        select(UserRoom.user_id.label("user_id"), func.count(UserRoom.id).label("room_count"))
        .group_by(UserRoom.user_id)
        .subquery()
    )
    rows = db.execute(
        select(User, func.coalesce(room_counts.c.room_count, 0))
        .outerjoin(room_counts, room_counts.c.user_id == User.id)
        .order_by(User.created_at.desc(), User.id.desc())
    )
    return [_managed_user_out(db, user, room_count=int(room_count)) for user, room_count in rows]


@router.get("/users/page", response_model=AdminManagedUserPageOut)
def list_users_page(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=10, le=100),
    q: str | None = Query(default=None, max_length=120),
    sort: str = Query(default="created_desc", pattern="^(created|email|rooms)_(asc|desc)$"),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminManagedUserPageOut:
    room_counts = (
        select(UserRoom.user_id.label("user_id"), func.count(UserRoom.id).label("room_count"))
        .group_by(UserRoom.user_id)
        .subquery()
    )
    filters = []
    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{keyword}%"
        search_terms = [User.email.ilike(pattern), User.notification_email.ilike(pattern)]
        if keyword.isdigit():
            search_terms.append(User.id == int(keyword))
        filters.append(or_(*search_terms))

    total = int(db.scalar(select(func.count(User.id)).where(*filters)) or 0)
    room_count_value = func.coalesce(room_counts.c.room_count, 0)
    order_columns = {
        "created_asc": (User.created_at.asc(), User.id.asc()),
        "created_desc": (User.created_at.desc(), User.id.desc()),
        "email_asc": (User.email.asc(), User.id.asc()),
        "email_desc": (User.email.desc(), User.id.desc()),
        "rooms_asc": (room_count_value.asc(), User.id.asc()),
        "rooms_desc": (room_count_value.desc(), User.id.desc()),
    }
    rows = db.execute(
        select(User, room_count_value)
        .outerjoin(room_counts, room_counts.c.user_id == User.id)
        .where(*filters)
        .order_by(*order_columns[sort])
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [_managed_user_out(db, user, room_count=int(room_count)) for user, room_count in rows]
    return AdminManagedUserPageOut(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/users/{user_id}", response_model=AdminManagedUserDetailOut)
def get_user_detail(
    user_id: int,
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminManagedUserDetailOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    rooms = list(
        db.scalars(
            select(UserRoom)
            .options(selectinload(UserRoom.room))
            .where(UserRoom.user_id == user.id)
            .order_by(UserRoom.id)
        )
    )
    base = _managed_user_out(db, user)
    return AdminManagedUserDetailOut(**base.model_dump(), rooms=rooms)


@router.patch("/users/{user_id}", response_model=AdminManagedUserDetailOut)
def update_user_config(
    user_id: int,
    payload: AdminManagedUserUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminManagedUserDetailOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    changed: list[str] = []
    if "notification_email" in payload.model_fields_set:
        if payload.notification_email:
            email = normalize_email(payload.notification_email)
            ensure_email_shape(email)
            user.notification_email = email
            if payload.notification_email_verified is not True:
                user.notification_email_verified_at = None
        else:
            user.notification_email = None
            user.notification_email_verified_at = None
        changed.append("notification_email")
    if "notification_email_verified" in payload.model_fields_set:
        user.notification_email_verified_at = datetime.now() if payload.notification_email_verified and user.notification_email else None
        changed.append("notification_email_verified")
    if "manual_check_cooldown_seconds" in payload.model_fields_set:
        user.manual_check_cooldown_seconds = payload.manual_check_cooldown_seconds
        changed.append("manual_check_cooldown_seconds")
    if "notify_cooldown_hours" in payload.model_fields_set:
        user.notify_cooldown_hours = payload.notify_cooldown_hours
        changed.append("notify_cooldown_hours")

    audit(db, admin, "update_user_config", "user", user.id, {"fields": changed})
    db.commit()
    return get_user_detail(user.id, admin, db)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    audit(db, admin, "delete_user", "user", user.id, {"email": user.email})
    delete_user_account(db, user)
    db.commit()


def get_user_room_for_admin(db: Session, user_id: int, binding_id: int) -> UserRoom:
    binding = db.scalar(
        select(UserRoom)
        .options(selectinload(UserRoom.room))
        .where(UserRoom.id == binding_id, UserRoom.user_id == user_id)
    )
    if binding is None:
        raise HTTPException(status_code=404, detail="room binding not found")
    return binding


@router.patch("/users/{user_id}/rooms/{binding_id}", response_model=UserRoomOut)
def update_user_room_config(
    user_id: int,
    binding_id: int,
    payload: AdminManagedUserRoomUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> UserRoom:
    binding = get_user_room_for_admin(db, user_id, binding_id)
    changed: list[str] = []
    if payload.alert_days is not None:
        binding.alert_days = payload.alert_days
        changed.append("alert_days")
    if payload.alert_threshold_mode is not None:
        binding.alert_threshold_mode = payload.alert_threshold_mode
        changed.append("alert_threshold_mode")
    if "low_power_threshold" in payload.model_fields_set:
        binding.low_power_threshold = payload.low_power_threshold
        changed.append("low_power_threshold")
    if "manual_check_cooldown_seconds" in payload.model_fields_set:
        binding.manual_check_cooldown_seconds = payload.manual_check_cooldown_seconds
        changed.append("manual_check_cooldown_seconds")
    if "notify_cooldown_hours" in payload.model_fields_set:
        binding.notify_cooldown_hours = payload.notify_cooldown_hours
        changed.append("notify_cooldown_hours")
    if payload.enabled is not None:
        binding.enabled = payload.enabled
        changed.append("enabled")

    audit(db, admin, "update_user_room_config", "user_room", binding.id, {"user_id": user_id, "fields": changed})
    db.commit()
    db.refresh(binding)
    return binding


@router.delete("/users/{user_id}/rooms/{binding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_room_binding(
    user_id: int,
    binding_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> None:
    binding = get_user_room_for_admin(db, user_id, binding_id)
    audit(db, admin, "delete_user_room_binding", "user_room", binding.id, {"user_id": user_id})
    db.delete(binding)
    db.commit()


def _first_test_room(db: Session, room_id: int | None = None) -> Room:
    room = db.get(Room, room_id) if room_id is not None else None
    if room is None and room_id is not None:
        raise HTTPException(status_code=404, detail="room not found")
    if room is None:
        room = db.scalar(select(Room).order_by(Room.id).limit(1))
    if room is None:
        raise HTTPException(status_code=400, detail="no room can be used for token test")
    return room


@router.get("/tokens", response_model=list[AdminAuthTokenOut])
def list_tokens(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminAuthTokenOut]:
    tokens = db.scalars(select(AuthToken).order_by(AuthToken.id))
    return [token_out(token) for token in tokens]


@router.post("/tokens", response_model=AdminAuthTokenOut, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: AdminAuthTokenCreate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminAuthTokenOut:
    token = AuthToken(
        name=payload.name.strip(),
        token_value=payload.token_value.strip(),
        min_interval_seconds=payload.min_interval_seconds,
        enabled=payload.enabled,
    )
    db.add(token)
    try:
        db.flush()
        audit(db, admin, "create_auth_token", "auth_token", token.id, {"name": token.name})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="token name already exists") from exc
    db.refresh(token)
    return token_out(token)


@router.patch("/tokens/{token_id}", response_model=AdminAuthTokenOut)
def update_token(
    token_id: int,
    payload: AdminAuthTokenUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminAuthTokenOut:
    token = db.get(AuthToken, token_id)
    if token is None:
        raise HTTPException(status_code=404, detail="token not found")
    if payload.name is not None:
        token.name = payload.name.strip()
    if payload.token_value is not None:
        token.token_value = payload.token_value.strip()
    if payload.min_interval_seconds is not None:
        token.min_interval_seconds = payload.min_interval_seconds
    if payload.enabled is not None:
        token.enabled = payload.enabled
    audit(
        db,
        admin,
        "update_auth_token",
        "auth_token",
        token.id,
        {"fields": [field for field in payload.model_fields_set if field != "token_value"], "token_value_updated": payload.token_value is not None},
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="token name already exists") from exc
    db.refresh(token)
    return token_out(token)


@router.post("/tokens/{token_id}/test", response_model=AdminHealthTestOut)
def test_token(
    token_id: int,
    payload: AdminTokenHealthTestRequest,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminHealthTestOut:
    token = db.get(AuthToken, token_id)
    if token is None:
        raise HTTPException(status_code=404, detail="token not found")
    room = _first_test_room(db, payload.room_id)
    result = CampusElectricityClient(token.token_value).query_room(room)
    token.last_used_at = datetime.now()
    record_token_health(
        db,
        token,
        success=result.success and result.balance is not None,
        source="admin_test",
        error_kind=result.error_kind,
        error_msg=result.error_msg,
    )
    audit(
        db,
        admin,
        "test_auth_token",
        "auth_token",
        token.id,
        {"success": result.success, "error_kind": result.error_kind, "room_id": room.id},
    )
    db.commit()
    return AdminHealthTestOut(success=result.success and result.balance is not None, error_kind=result.error_kind, error_msg=result.error_msg)


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_token(
    token_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> None:
    token = db.get(AuthToken, token_id)
    if token is None:
        raise HTTPException(status_code=404, detail="token not found")
    audit(db, admin, "delete_auth_token", "auth_token", token.id, {"name": token.name})
    db.delete(token)
    db.commit()


@router.get("/smtp", response_model=list[SmtpSettingsOut])
def list_smtp_settings(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[SmtpSettingsOut]:
    rows = db.scalars(select(SmtpSettings).order_by(SmtpSettings.id))
    return [smtp_out(row) for row in rows]


@router.post("/smtp", response_model=SmtpSettingsOut, status_code=status.HTTP_201_CREATED)
def create_smtp_settings(
    payload: SmtpSettingsCreate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> SmtpSettingsOut:
    row = SmtpSettings(
        id=next_smtp_id(db),
        name=payload.name.strip(),
        host=payload.host.strip(),
        port=payload.port,
        username=payload.username.strip() if payload.username else None,
        password=payload.password or None,
        from_email=payload.from_email.strip(),
        enabled=payload.enabled,
        min_interval_seconds=payload.min_interval_seconds,
        use_ssl=payload.use_ssl,
        use_starttls=payload.use_starttls,
    )
    db.add(row)
    try:
        db.flush()
        audit(db, admin, "create_smtp_settings", "smtp_settings", row.id, {"name": row.name})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="smtp account could not be created, please retry") from exc
    db.refresh(row)
    return smtp_out(row)


@router.patch("/smtp/{smtp_id}", response_model=SmtpSettingsOut)
def update_smtp_settings(
    smtp_id: int,
    payload: SmtpSettingsUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> SmtpSettingsOut:
    row = db.get(SmtpSettings, smtp_id)
    if row is None:
        raise HTTPException(status_code=404, detail="smtp account not found")
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.host is not None:
        row.host = payload.host.strip() or None
    if payload.port is not None:
        row.port = payload.port
    if payload.username is not None:
        row.username = payload.username.strip() or None
    if payload.password is not None:
        row.password = payload.password or None
    if payload.from_email is not None:
        row.from_email = payload.from_email.strip() or None
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.min_interval_seconds is not None:
        row.min_interval_seconds = payload.min_interval_seconds
    if payload.use_ssl is not None:
        row.use_ssl = payload.use_ssl
    if payload.use_starttls is not None:
        row.use_starttls = payload.use_starttls
    audit(
        db,
        admin,
        "update_smtp_settings",
        "smtp_settings",
        row.id,
        {"fields": [field for field in payload.model_fields_set if field != "password"], "password_updated": payload.password is not None},
    )
    db.commit()
    db.refresh(row)
    return smtp_out(row)


@router.delete("/smtp/{smtp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_smtp_settings(
    smtp_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> None:
    row = db.get(SmtpSettings, smtp_id)
    if row is None:
        raise HTTPException(status_code=404, detail="smtp account not found")
    audit(db, admin, "delete_smtp_settings", "smtp_settings", row.id, {"name": row.name})
    db.delete(row)
    db.commit()


@router.post("/smtp/test")
def test_smtp_settings(
    payload: SmtpTestRequest,
    _: AdminUser = Depends(current_admin),
) -> dict[str, str]:
    result = send_email(payload.to_email, "Electricity Monitor SMTP 测试", "这是一封管理后台 SMTP 测试邮件。", source="admin_test")
    if not result.ok:
        raise HTTPException(status_code=502, detail=result.error)
    return {"status": "sent"}


@router.post("/smtp/{smtp_id}/test")
def test_one_smtp_settings(
    smtp_id: int,
    payload: SmtpTestRequest,
    _: AdminUser = Depends(current_admin),
) -> dict[str, str]:
    result = send_email(
        payload.to_email,
        "Electricity Monitor SMTP 测试",
        "这是一封管理后台 SMTP 测试邮件。",
        smtp_id=smtp_id,
        source="admin_test",
    )
    if not result.ok:
        raise HTTPException(status_code=502, detail=result.error)
    return {"status": "sent"}


@router.get("/settings", response_model=RuntimeSettingsOut)
def get_runtime_settings(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> RuntimeSettingsOut:
    return RuntimeSettingsOut(**get_runtime_config(db).__dict__)


@router.patch("/settings", response_model=RuntimeSettingsOut)
def patch_runtime_settings(
    payload: RuntimeSettingsUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> RuntimeSettingsOut:
    runtime = update_runtime_config(db, payload.model_dump(exclude_unset=True))
    audit(db, admin, "update_runtime_settings", "app_settings", None, {"fields": list(payload.model_fields_set)})
    db.commit()
    return RuntimeSettingsOut(**runtime.__dict__)


@router.post("/jobs/checks/run")
def run_checks_once(
    _: AdminUser = Depends(current_admin),
) -> dict[str, int]:
    result = run_room_checks(check_all=False, source="admin")
    return {"checked": result.checked, "succeeded": result.succeeded, "failed": result.failed}


@router.post("/jobs/notifications/run")
def run_notifications_once(
    _: AdminUser = Depends(current_admin),
) -> dict[str, int]:
    result = run_low_power_notifications()
    return {"scanned": result.scanned, "sent": result.sent, "skipped": result.skipped, "failed": result.failed}


@router.post("/jobs/data-retention/run", response_model=DataRetentionCleanupOut)
def run_data_retention_once(
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> DataRetentionCleanupOut:
    result = cleanup_data_retention(db)
    audit(db, admin, "run_data_retention_cleanup", "app_settings", None, {"total_deleted": result.total_deleted})
    db.commit()
    return DataRetentionCleanupOut(**result.__dict__, total_deleted=result.total_deleted)


@router.post("/rate-limits/clear", response_model=RateLimitClearOut)
def clear_rate_limit_records(
    payload: RateLimitClearRequest,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> RateLimitClearOut:
    cleared_keys = limiter.clear_matching(
        bucket=payload.bucket,
        client_ip=payload.client_ip,
        identity=payload.identity,
    )
    audit(
        db,
        admin,
        "clear_rate_limits",
        "rate_limit",
        payload.client_ip or payload.identity or payload.bucket or "all",
        {"bucket": payload.bucket, "client_ip": payload.client_ip, "identity": payload.identity, "cleared_keys": cleared_keys},
    )
    db.commit()
    return RateLimitClearOut(cleared_keys=cleared_keys)
