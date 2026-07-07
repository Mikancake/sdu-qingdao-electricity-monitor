from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.binding import UserRoomOut
from app.schemas.room import RoomOut


class AdminLogin(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class AdminUserOut(BaseModel):
    id: int
    username: str
    display_name: str | None
    enabled: bool
    last_login_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)


class AdminPasswordUpdate(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminUserOut


class AdminAuthTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    token_value: str = Field(min_length=10)
    min_interval_seconds: int = Field(default=10, ge=0, le=3600)
    enabled: bool = True


class AdminAuthTokenUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    token_value: str | None = Field(default=None, min_length=10)
    min_interval_seconds: int | None = Field(default=None, ge=0, le=3600)
    enabled: bool | None = None


class AdminAuthTokenOut(BaseModel):
    id: int
    name: str
    token_preview: str
    enabled: bool
    min_interval_seconds: int
    last_used_at: datetime | None
    created_at: datetime


class SmtpSettingsUpdate(BaseModel):
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=512)
    from_email: str | None = Field(default=None, max_length=255)
    use_ssl: bool | None = None
    use_starttls: bool | None = None


class SmtpSettingsOut(BaseModel):
    configured: bool
    host: str | None
    port: int
    username: str | None
    from_email: str | None
    use_ssl: bool
    use_starttls: bool
    password_configured: bool
    updated_at: datetime | None = None


class SmtpTestRequest(BaseModel):
    to_email: str = Field(min_length=3, max_length=255)


class RuntimeSettingsOut(BaseModel):
    check_interval_seconds: int
    check_batch_size: int
    check_request_delay_seconds: float
    notify_interval_seconds: int
    notify_cooldown_hours: int
    default_alert_days: int
    default_daily_usage_kwh: float
    usage_history_days: int
    manual_check_cooldown_seconds: int
    worker_idle_seconds: int
    max_rooms_per_user: int
    verification_code_retention_days: int
    check_attempt_retention_days: int
    notification_retention_days: int
    electricity_reading_retention_days: int
    admin_audit_log_retention_days: int
    retention_cleanup_hour: int


class RuntimeSettingsUpdate(BaseModel):
    check_interval_seconds: int | None = Field(default=None, ge=60, le=60 * 60 * 24 * 7)
    check_batch_size: int | None = Field(default=None, ge=1, le=5000)
    check_request_delay_seconds: float | None = Field(default=None, ge=0, le=60)
    notify_interval_seconds: int | None = Field(default=None, ge=60, le=60 * 60 * 24 * 7)
    notify_cooldown_hours: int | None = Field(default=None, ge=1, le=24 * 30)
    default_alert_days: int | None = Field(default=None, ge=1, le=30)
    default_daily_usage_kwh: float | None = Field(default=None, ge=0.1, le=100)
    usage_history_days: int | None = Field(default=None, ge=1, le=365)
    manual_check_cooldown_seconds: int | None = Field(default=None, ge=0, le=60 * 60)
    worker_idle_seconds: int | None = Field(default=None, ge=1, le=300)
    max_rooms_per_user: int | None = Field(default=None, ge=1, le=100)
    verification_code_retention_days: int | None = Field(default=None, ge=0, le=3650)
    check_attempt_retention_days: int | None = Field(default=None, ge=0, le=3650)
    notification_retention_days: int | None = Field(default=None, ge=0, le=3650)
    electricity_reading_retention_days: int | None = Field(default=None, ge=0, le=3650)
    admin_audit_log_retention_days: int | None = Field(default=None, ge=0, le=3650)
    retention_cleanup_hour: int | None = Field(default=None, ge=0, le=23)


class DataRetentionCleanupOut(BaseModel):
    verification_codes_deleted: int
    check_attempts_deleted: int
    notifications_deleted: int
    electricity_readings_deleted: int
    admin_audit_logs_deleted: int
    total_deleted: int


class RateLimitClearRequest(BaseModel):
    bucket: str | None = Field(default=None, max_length=80)
    client_ip: str | None = Field(default=None, max_length=80)
    identity: str | None = Field(default=None, max_length=255)


class RateLimitClearOut(BaseModel):
    cleared_keys: int


class AdminStatusOut(BaseModel):
    token_count: int
    enabled_token_count: int
    smtp_configured: bool
    pending_notifications: int
    failed_notifications: int
    total_rooms: int
    total_users: int
    latest_read_at: datetime | None


class AdminManagedUserOut(BaseModel):
    id: int
    email: str
    is_verified: bool
    notification_email: str | None
    notification_email_verified: bool
    manual_check_cooldown_seconds: int | None
    notify_cooldown_hours: int | None
    room_count: int
    created_at: datetime


class AdminManagedUserDetailOut(AdminManagedUserOut):
    rooms: list[UserRoomOut]


class AdminManagedUserUpdate(BaseModel):
    notification_email: str | None = Field(default=None, max_length=255)
    notification_email_verified: bool | None = None
    manual_check_cooldown_seconds: int | None = Field(default=None, ge=0, le=60 * 60)
    notify_cooldown_hours: int | None = Field(default=None, ge=0, le=24 * 30)


class AdminManagedUserRoomUpdate(BaseModel):
    alert_days: int | None = Field(default=None, ge=1, le=30)
    alert_threshold_mode: str | None = Field(default=None, pattern="^(days|average|fixed)$")
    low_power_threshold: Decimal | None = Field(default=None, ge=0)
    manual_check_cooldown_seconds: int | None = Field(default=None, ge=0, le=60 * 60)
    notify_cooldown_hours: int | None = Field(default=None, ge=0, le=24 * 30)
    enabled: bool | None = None


class AdminRoomBindingOut(BaseModel):
    binding_id: int
    user_id: int
    email: str
    notification_email: str | None
    notification_email_verified: bool
    enabled: bool
    created_at: datetime


class AdminRoomOut(BaseModel):
    room: RoomOut
    binding_count: int
    bindings: list[AdminRoomBindingOut]


class AdminAuditLogOut(BaseModel):
    id: int
    admin_id: int | None
    action: str
    target_type: str
    target_id: str | None
    detail: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
