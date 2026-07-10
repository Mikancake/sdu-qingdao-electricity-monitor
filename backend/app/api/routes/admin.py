import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import current_admin, db_session
from app.core.config import settings
from app.api.routes.auth import ensure_email_shape, normalize_email
from app.core.security import hash_password, sign_access_token, verify_password
from app.electricity.client import CampusElectricityClient
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.models.auth_token import AuthToken
from app.models.auth_token_health_log import AuthTokenHealthLog
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.room import Room
from app.models.smtp_health_log import SmtpHealthLog
from app.models.smtp_settings import SmtpSettings
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import (
    AdminAuthTokenCreate,
    AdminAuthTokenHealthLogOut,
    AdminAuthTokenOut,
    AdminAuthTokenUpdate,
    AdminHealthTestOut,
    AdminRoomBindingOut,
    AdminRoomOut,
    AdminAuditLogOut,
    AdminTokenHealthTestRequest,
    AdminLogin,
    AdminManagedUserDetailOut,
    AdminManagedUserOut,
    AdminManagedUserRoomUpdate,
    AdminManagedUserUpdate,
    AdminPasswordUpdate,
    AdminProfileUpdate,
    AdminStatusOut,
    AdminTokenOut,
    AdminUserOut,
    DataRetentionCleanupOut,
    RateLimitClearOut,
    RateLimitClearRequest,
    RuntimeSettingsOut,
    RuntimeSettingsUpdate,
    SmtpHealthLogOut,
    SmtpSettingsCreate,
    SmtpSettingsOut,
    SmtpSettingsUpdate,
    SmtpTestRequest,
)
from app.schemas.appearance import AppearanceBackgroundUploadOut, AppearanceSettingsOut, AppearanceSettingsUpdate
from app.schemas.binding import UserRoomOut
from app.services.admins import normalize_username
from app.services.appearance import get_appearance_settings, update_appearance_settings
from app.services.data_retention import cleanup_data_retention
from app.services.emailer import send_email, smtp_configured
from app.services.notifications import run_low_power_notifications
from app.services.rate_limit import enforce_rate_limit, limiter, rate_limit_key
from app.services.room_checks import run_room_checks
from app.services.runtime_settings import get_runtime_config, update_runtime_config
from app.services.token_health import record_token_health
from app.services.users import delete_user_account


router = APIRouter()
ALLOWED_APPEARANCE_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


def audit(db: Session, admin: AdminUser, action: str, target_type: str, target_id: object | None, detail: dict | None = None) -> None:
    db.add(
        AdminAuditLog(
            admin_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            detail=json.dumps(detail or {}, ensure_ascii=False),
        )
    )


def _preview_secret(value: str, *, head: int = 6, tail: int = 4) -> str:
    if len(value) <= head + tail:
        return "*" * len(value)
    return f"{value[:head]}...{value[-tail:]}"


def _log_since(days: int) -> datetime:
    return datetime.now() - timedelta(days=days)


def _search_pattern(q: str | None) -> str | None:
    value = (q or "").strip()
    return f"%{value}%" if value else None


def _log_order(model: object, sort: Literal["asc", "desc"]):
    if sort == "asc":
        return (model.created_at.asc(), model.id.asc())
    return (model.created_at.desc(), model.id.desc())


def _token_out(token: AuthToken) -> AdminAuthTokenOut:
    return AdminAuthTokenOut(
        id=token.id,
        name=token.name,
        token_preview=_preview_secret(token.token_value),
        enabled=token.enabled,
        min_interval_seconds=token.min_interval_seconds,
        last_used_at=token.last_used_at,
        health_status=token.health_status or "unknown",
        failure_count=token.failure_count or 0,
        last_checked_at=token.last_checked_at,
        last_success_at=token.last_success_at,
        last_error_at=token.last_error_at,
        last_error_kind=token.last_error_kind,
        last_error_msg=token.last_error_msg,
        created_at=token.created_at,
    )


def _smtp_out(row: SmtpSettings) -> SmtpSettingsOut:
    return SmtpSettingsOut(
        id=row.id,
        name=row.name or f"smtp-{row.id}",
        configured=bool(row.host and row.from_email),
        host=row.host,
        port=row.port,
        username=row.username,
        from_email=row.from_email,
        enabled=row.enabled,
        min_interval_seconds=row.min_interval_seconds or 0,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        password_configured=bool(row.password),
        last_used_at=row.last_used_at,
        health_status=row.health_status or "unknown",
        failure_count=row.failure_count or 0,
        last_checked_at=row.last_checked_at,
        last_success_at=row.last_success_at,
        last_error_at=row.last_error_at,
        last_error_kind=row.last_error_kind,
        last_error_msg=row.last_error_msg,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _next_smtp_id(db: Session) -> int:
    current_max = db.scalar(select(func.max(SmtpSettings.id))) or 0
    return int(current_max) + 1


@router.post("/auth/login", response_model=AdminTokenOut)
def admin_login(request: Request, payload: AdminLogin, db: Session = Depends(db_session)) -> AdminTokenOut:
    username = normalize_username(payload.username)
    enforce_rate_limit(rate_limit_key(request, "admin:login", username), limit=8, window_seconds=10 * 60)
    admin = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if admin is None or not admin.enabled or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="invalid username or password")
    admin.last_login_at = datetime.now()
    db.commit()
    db.refresh(admin)
    return AdminTokenOut(access_token=sign_access_token(admin.id, kind="admin"), admin=admin)


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


@router.post("/auth/password")
def update_admin_password(
    payload: AdminPasswordUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> dict[str, str]:
    if not verify_password(payload.old_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="old password is incorrect")
    admin.password_hash = hash_password(payload.new_password)
    audit(db, admin, "update_admin_password", "admin_user", admin.id)
    db.commit()
    return {"status": "updated"}


def _managed_user_out(db: Session, user: User) -> AdminManagedUserOut:
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
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc()))
    return [_managed_user_out(db, user) for user in users]


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


@router.get("/rooms", response_model=list[AdminRoomOut])
def list_admin_rooms(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminRoomOut]:
    rooms = list(
        db.scalars(
            select(Room)
            .join(UserRoom, UserRoom.room_id == Room.id)
            .options(selectinload(Room.user_rooms).selectinload(UserRoom.user))
            .distinct()
            .order_by(Room.building_name, Room.room_number, Room.id)
        )
    )
    result: list[AdminRoomOut] = []
    for room in rooms:
        bindings = sorted(room.user_rooms, key=lambda item: item.id)
        result.append(
            AdminRoomOut(
                room=room,
                binding_count=len(bindings),
                bindings=[
                    AdminRoomBindingOut(
                        binding_id=binding.id,
                        user_id=binding.user_id,
                        email=binding.user.email if binding.user else "",
                        notification_email=binding.user.notification_email if binding.user else None,
                        notification_email_verified=binding.user.notification_email_verified if binding.user else False,
                        enabled=binding.enabled,
                        created_at=binding.created_at,
                    )
                    for binding in bindings
                ],
            )
        )
    return result


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
    return [_token_out(token) for token in tokens]


@router.get("/tokens/health-logs", response_model=list[AdminAuthTokenHealthLogOut])
def list_token_health_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[AdminAuthTokenHealthLogOut]:
    stmt = select(AuthTokenHealthLog, AuthToken).outerjoin(
        AuthToken, AuthToken.id == AuthTokenHealthLog.auth_token_id
    )
    if days:
        stmt = stmt.where(AuthTokenHealthLog.created_at >= _log_since(days))
    pattern = _search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                AuthToken.name.ilike(pattern),
                AuthTokenHealthLog.source.ilike(pattern),
                AuthTokenHealthLog.error_kind.ilike(pattern),
                AuthTokenHealthLog.error_msg.ilike(pattern),
                AuthTokenHealthLog.health_status.ilike(pattern),
            )
        )
    stmt = stmt.order_by(*_log_order(AuthTokenHealthLog, sort))
    if limit:
        stmt = stmt.limit(limit)
    rows = list(
        db.execute(
            stmt
        ).all()
    )
    return [
        AdminAuthTokenHealthLogOut(
            id=log.id,
            token_id=log.auth_token_id,
            token_name=token.name if token else None,
            source=log.source,
            success=log.success,
            error_kind=log.error_kind,
            error_msg=log.error_msg,
            health_status=log.health_status,
            failure_count=log.failure_count,
            created_at=log.created_at,
        )
        for log, token in rows
    ]


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
    return _token_out(token)


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
    return _token_out(token)


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
    return [_smtp_out(row) for row in rows]


@router.get("/smtp/health-logs", response_model=list[SmtpHealthLogOut])
def list_smtp_health_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[SmtpHealthLogOut]:
    stmt = select(SmtpHealthLog, SmtpSettings).outerjoin(
        SmtpSettings, SmtpSettings.id == SmtpHealthLog.smtp_settings_id
    )
    if days:
        stmt = stmt.where(SmtpHealthLog.created_at >= _log_since(days))
    pattern = _search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                SmtpSettings.name.ilike(pattern),
                SmtpHealthLog.source.ilike(pattern),
                SmtpHealthLog.recipient_email.ilike(pattern),
                SmtpHealthLog.error_kind.ilike(pattern),
                SmtpHealthLog.error_msg.ilike(pattern),
                SmtpHealthLog.health_status.ilike(pattern),
            )
        )
    stmt = stmt.order_by(*_log_order(SmtpHealthLog, sort))
    if limit:
        stmt = stmt.limit(limit)
    rows = list(
        db.execute(
            stmt
        ).all()
    )
    return [
        SmtpHealthLogOut(
            id=log.id,
            smtp_id=log.smtp_settings_id,
            smtp_name=smtp.name if smtp else None,
            source=log.source,
            recipient_email=log.recipient_email,
            success=log.success,
            error_kind=log.error_kind,
            error_msg=log.error_msg,
            health_status=log.health_status,
            failure_count=log.failure_count,
            created_at=log.created_at,
        )
        for log, smtp in rows
    ]


@router.post("/smtp", response_model=SmtpSettingsOut, status_code=status.HTTP_201_CREATED)
def create_smtp_settings(
    payload: SmtpSettingsCreate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> SmtpSettingsOut:
    row = SmtpSettings(
        id=_next_smtp_id(db),
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
    return _smtp_out(row)


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
    return _smtp_out(row)


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


@router.get("/appearance", response_model=AppearanceSettingsOut)
def get_admin_appearance_settings(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceSettingsOut:
    return get_appearance_settings(db)


@router.patch("/appearance", response_model=AppearanceSettingsOut)
def patch_admin_appearance_settings(
    payload: AppearanceSettingsUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceSettingsOut:
    settings = update_appearance_settings(db, payload.model_dump(exclude_unset=True))
    audit(db, admin, "update_appearance_settings", "app_settings", "appearance_settings", {"fields": list(payload.model_fields_set)})
    db.commit()
    return settings


@router.post("/appearance/background", response_model=AppearanceBackgroundUploadOut)
async def upload_appearance_background(
    theme: Literal["light", "dark"] = Form(default="light"),
    file: UploadFile = File(...),
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceBackgroundUploadOut:
    suffix = ALLOWED_APPEARANCE_IMAGE_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(status_code=400, detail="only jpg, png, webp, and avif images are supported")

    upload_root = Path(settings.upload_dir) / "appearance"
    upload_root.mkdir(parents=True, exist_ok=True)
    filename = f"{theme}-{uuid4().hex}{suffix}"
    target = upload_root / filename

    written = 0
    try:
        with target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > settings.appearance_upload_max_bytes:
                    raise HTTPException(status_code=413, detail="image is too large")
                handle.write(chunk)
    except Exception:
        if target.exists():
            target.unlink()
        raise
    finally:
        await file.close()

    url = f"/uploads/appearance/{filename}"
    audit(db, admin, "upload_appearance_background", "app_settings", "appearance_settings", {"theme": theme, "url": url})
    db.commit()
    return AppearanceBackgroundUploadOut(theme=theme, url=url)


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


@router.get("/status", response_model=AdminStatusOut)
def get_admin_status(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminStatusOut:
    token_count = db.scalar(select(func.count(AuthToken.id))) or 0
    enabled_token_count = db.scalar(select(func.count(AuthToken.id)).where(AuthToken.enabled.is_(True))) or 0
    unhealthy_token_count = db.scalar(
        select(func.count(AuthToken.id)).where(AuthToken.health_status.in_(["warning", "invalid"]))
    ) or 0
    smtp_count = db.scalar(select(func.count(SmtpSettings.id))) or 0
    enabled_smtp_count = db.scalar(select(func.count(SmtpSettings.id)).where(SmtpSettings.enabled.is_(True))) or 0
    unhealthy_smtp_count = db.scalar(
        select(func.count(SmtpSettings.id)).where(SmtpSettings.health_status.in_(["warning", "invalid"]))
    ) or 0
    pending_notifications = db.scalar(select(func.count(Notification.id)).where(Notification.status == "pending")) or 0
    failed_notifications = db.scalar(select(func.count(Notification.id)).where(Notification.status == "error")) or 0
    sent_notifications = db.scalar(select(func.count(Notification.id)).where(Notification.status == "sent")) or 0
    total_notifications = db.scalar(select(func.count(Notification.id))) or 0
    recent_cutoff = datetime.now() - timedelta(hours=24)
    recent_sent_notifications = db.scalar(
        select(func.count(Notification.id)).where(Notification.status == "sent", Notification.sent_at >= recent_cutoff)
    ) or 0
    recent_failed_notifications = db.scalar(
        select(func.count(Notification.id)).where(Notification.status == "error", Notification.created_at >= recent_cutoff)
    ) or 0
    daily_report_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(EmailDeliveryLog.source == "daily_report", EmailDeliveryLog.status == "sent")
    ) or 0
    total_daily_report_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(EmailDeliveryLog.source == "daily_report")
    ) or 0
    recent_daily_report_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(
            EmailDeliveryLog.source == "daily_report",
            EmailDeliveryLog.status == "sent",
            EmailDeliveryLog.sent_at >= recent_cutoff,
        )
    ) or 0
    recent_failed_daily_report_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(
            EmailDeliveryLog.source == "daily_report",
            EmailDeliveryLog.status == "error",
            EmailDeliveryLog.created_at >= recent_cutoff,
        )
    ) or 0
    all_sent_emails = db.scalar(select(func.count(EmailDeliveryLog.id)).where(EmailDeliveryLog.status == "sent")) or 0
    all_total_emails = db.scalar(select(func.count(EmailDeliveryLog.id))) or 0
    recent_sent_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(EmailDeliveryLog.status == "sent", EmailDeliveryLog.sent_at >= recent_cutoff)
    ) or 0
    recent_failed_emails = db.scalar(
        select(func.count(EmailDeliveryLog.id)).where(EmailDeliveryLog.status == "error", EmailDeliveryLog.created_at >= recent_cutoff)
    ) or 0
    total_rooms = db.scalar(select(func.count(func.distinct(UserRoom.room_id)))) or 0
    active_bindings = db.scalar(select(func.count(UserRoom.id)).where(UserRoom.enabled.is_(True))) or 0
    total_users = db.scalar(select(func.count(User.id))) or 0
    verified_users = db.scalar(select(func.count(User.id)).where(User.is_verified.is_(True))) or 0
    latest_read_at = db.scalar(select(ElectricityReading.read_at).order_by(ElectricityReading.read_at.desc()).limit(1))
    return AdminStatusOut(
        token_count=token_count,
        enabled_token_count=enabled_token_count,
        unhealthy_token_count=unhealthy_token_count,
        smtp_count=smtp_count,
        enabled_smtp_count=enabled_smtp_count,
        unhealthy_smtp_count=unhealthy_smtp_count,
        smtp_configured=smtp_configured(),
        pending_notifications=pending_notifications,
        failed_notifications=failed_notifications,
        sent_notifications=sent_notifications + daily_report_emails,
        total_notifications=total_notifications + total_daily_report_emails,
        recent_sent_notifications=recent_sent_notifications + recent_daily_report_emails,
        recent_failed_notifications=recent_failed_notifications + recent_failed_daily_report_emails,
        all_sent_emails=all_sent_emails,
        all_total_emails=all_total_emails,
        recent_sent_emails=recent_sent_emails,
        recent_failed_emails=recent_failed_emails,
        active_bindings=active_bindings,
        verified_users=verified_users,
        total_rooms=total_rooms,
        total_users=total_users,
        latest_read_at=latest_read_at,
    )


@router.get("/audit-logs", response_model=list[AdminAuditLogOut])
def list_audit_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[AdminAuditLog]:
    stmt = select(AdminAuditLog)
    if days:
        stmt = stmt.where(AdminAuditLog.created_at >= _log_since(days))
    pattern = _search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                AdminAuditLog.action.ilike(pattern),
                AdminAuditLog.target_type.ilike(pattern),
                AdminAuditLog.target_id.ilike(pattern),
                AdminAuditLog.detail.ilike(pattern),
            )
        )
    stmt = stmt.order_by(*_log_order(AdminAuditLog, sort))
    if limit:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


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
