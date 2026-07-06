import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import current_admin, db_session
from app.api.routes.auth import ensure_email_shape, normalize_email
from app.core.security import hash_password, sign_access_token, verify_password
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.models.auth_token import AuthToken
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.room import Room
from app.models.smtp_settings import SmtpSettings
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import (
    AdminAuthTokenCreate,
    AdminAuthTokenOut,
    AdminAuthTokenUpdate,
    AdminRoomBindingOut,
    AdminRoomOut,
    AdminAuditLogOut,
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
    RuntimeSettingsOut,
    RuntimeSettingsUpdate,
    SmtpSettingsOut,
    SmtpSettingsUpdate,
    SmtpTestRequest,
)
from app.schemas.binding import UserRoomOut
from app.services.admins import normalize_username
from app.services.emailer import load_smtp_config, send_email
from app.services.notifications import run_low_power_notifications
from app.services.room_checks import run_room_checks
from app.services.runtime_settings import get_runtime_config, update_runtime_config
from app.services.users import delete_user_account


router = APIRouter()


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


def _token_out(token: AuthToken) -> AdminAuthTokenOut:
    return AdminAuthTokenOut(
        id=token.id,
        name=token.name,
        token_preview=_preview_secret(token.token_value),
        enabled=token.enabled,
        min_interval_seconds=token.min_interval_seconds,
        last_used_at=token.last_used_at,
        created_at=token.created_at,
    )


def _smtp_out(row: SmtpSettings | None = None) -> SmtpSettingsOut:
    if row is None:
        config = load_smtp_config()
        return SmtpSettingsOut(
            configured=config.configured,
            host=config.host,
            port=config.port,
            username=config.username,
            from_email=config.from_email,
            use_ssl=config.use_ssl,
            use_starttls=config.use_starttls,
            password_configured=bool(config.password),
            updated_at=None,
        )
    return SmtpSettingsOut(
        configured=bool(row.host and row.from_email),
        host=row.host,
        port=row.port,
        username=row.username,
        from_email=row.from_email,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        password_configured=bool(row.password),
        updated_at=row.updated_at,
    )


@router.post("/auth/login", response_model=AdminTokenOut)
def admin_login(payload: AdminLogin, db: Session = Depends(db_session)) -> AdminTokenOut:
    username = normalize_username(payload.username)
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


@router.get("/tokens", response_model=list[AdminAuthTokenOut])
def list_tokens(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminAuthTokenOut]:
    tokens = db.scalars(select(AuthToken).order_by(AuthToken.id))
    return [_token_out(token) for token in tokens]


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


@router.get("/smtp", response_model=SmtpSettingsOut)
def get_smtp_settings(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> SmtpSettingsOut:
    return _smtp_out(db.get(SmtpSettings, 1))


@router.put("/smtp", response_model=SmtpSettingsOut)
def update_smtp_settings(
    payload: SmtpSettingsUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> SmtpSettingsOut:
    row = db.get(SmtpSettings, 1)
    if row is None:
        row = SmtpSettings(id=1)
        db.add(row)
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
    if payload.use_ssl is not None:
        row.use_ssl = payload.use_ssl
    if payload.use_starttls is not None:
        row.use_starttls = payload.use_starttls
    audit(
        db,
        admin,
        "update_smtp_settings",
        "smtp_settings",
        1,
        {"fields": [field for field in payload.model_fields_set if field != "password"], "password_updated": payload.password is not None},
    )
    db.commit()
    db.refresh(row)
    return _smtp_out(row)


@router.post("/smtp/test")
def test_smtp_settings(
    payload: SmtpTestRequest,
    _: AdminUser = Depends(current_admin),
) -> dict[str, str]:
    result = send_email(payload.to_email, "Electricity Monitor SMTP 测试", "这是一封管理后台 SMTP 测试邮件。")
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


@router.get("/status", response_model=AdminStatusOut)
def get_admin_status(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminStatusOut:
    token_count = db.scalar(select(func.count(AuthToken.id))) or 0
    enabled_token_count = db.scalar(select(func.count(AuthToken.id)).where(AuthToken.enabled.is_(True))) or 0
    pending_notifications = db.scalar(select(func.count(Notification.id)).where(Notification.status == "pending")) or 0
    failed_notifications = db.scalar(select(func.count(Notification.id)).where(Notification.status == "error")) or 0
    total_rooms = db.scalar(select(func.count(func.distinct(UserRoom.room_id)))) or 0
    total_users = db.scalar(select(func.count(User.id))) or 0
    latest_read_at = db.scalar(select(ElectricityReading.read_at).order_by(ElectricityReading.read_at.desc()).limit(1))
    return AdminStatusOut(
        token_count=token_count,
        enabled_token_count=enabled_token_count,
        smtp_configured=load_smtp_config().configured,
        pending_notifications=pending_notifications,
        failed_notifications=failed_notifications,
        total_rooms=total_rooms,
        total_users=total_users,
        latest_read_at=latest_read_at,
    )


@router.get("/audit-logs", response_model=list[AdminAuditLogOut])
def list_audit_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminAuditLog]:
    return list(db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(200)))


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
