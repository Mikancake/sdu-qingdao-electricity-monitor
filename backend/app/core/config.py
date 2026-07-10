from functools import lru_cache
from ipaddress import ip_network

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Electricity Monitor", validation_alias="APP_NAME")
    debug: bool = Field(default=False, validation_alias="APP_DEBUG")
    secret_key: str = Field(default="dev-secret-change-me-before-deploy", validation_alias="SECRET_KEY")
    credential_encryption_key: str | None = Field(default=None, validation_alias="CREDENTIAL_ENCRYPTION_KEY")
    credential_encryption_old_keys: str = Field(default="", validation_alias="CREDENTIAL_ENCRYPTION_OLD_KEYS")
    allow_insecure_startup: bool = Field(default=False, validation_alias="ALLOW_INSECURE_STARTUP")
    access_token_expire_minutes: int = Field(
        default=60 * 24 * 7,
        ge=5,
        le=60 * 24 * 30,
        validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    initial_admin_username: str | None = Field(default=None, validation_alias="INITIAL_ADMIN_USERNAME")
    initial_admin_password: str | None = Field(default=None, validation_alias="INITIAL_ADMIN_PASSWORD")
    initial_admin_display_name: str | None = Field(default=None, validation_alias="INITIAL_ADMIN_DISPLAY_NAME")

    database_url: str = Field(
        default="sqlite:///./dev.sqlite3",
        validation_alias="DATABASE_URL",
    )

    cors_origins: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173",
        validation_alias="CORS_ORIGINS",
    )
    trusted_hosts: str = Field(default="", validation_alias="TRUSTED_HOSTS")
    trusted_proxy_cidrs: str = Field(
        default="127.0.0.1/32,::1/128",
        validation_alias="TRUSTED_PROXY_CIDRS",
    )
    security_headers_enabled: bool = Field(default=True, validation_alias="SECURITY_HEADERS_ENABLED")

    electricity_api_url: str = Field(
        default="https://mcard.sdu.edu.cn/charge/feeitem/getThirdData",
        validation_alias="ELECTRICITY_API_URL",
    )
    electricity_api_type: str = Field(default="IEC", validation_alias="ELECTRICITY_API_TYPE")
    electricity_api_level: str = Field(default="3", validation_alias="ELECTRICITY_API_LEVEL")
    electricity_api_feeitemid: str = Field(default="410", validation_alias="ELECTRICITY_API_FEEITEMID")
    electricity_api_timeout: int = Field(default=10, validation_alias="ELECTRICITY_API_TIMEOUT")

    background_tasks_enabled: bool = Field(default=False, validation_alias="BACKGROUND_TASKS_ENABLED")
    check_interval_seconds: int = Field(default=4 * 60 * 60, validation_alias="CHECK_INTERVAL_SECONDS")
    check_batch_size: int = Field(default=50, validation_alias="CHECK_BATCH_SIZE")
    check_request_delay_seconds: float = Field(default=0.5, validation_alias="CHECK_REQUEST_DELAY_SECONDS")
    notify_interval_seconds: int = Field(default=60 * 60, validation_alias="NOTIFY_INTERVAL_SECONDS")
    notify_cooldown_hours: int = Field(default=12, validation_alias="NOTIFY_COOLDOWN_HOURS")
    default_alert_days: int = Field(default=1, validation_alias="DEFAULT_ALERT_DAYS")
    default_daily_usage_kwh: float = Field(default=5.0, validation_alias="DEFAULT_DAILY_USAGE_KWH")
    usage_history_days: int = Field(default=14, validation_alias="USAGE_HISTORY_DAYS")
    max_rooms_per_user: int = Field(default=3, validation_alias="MAX_ROOMS_PER_USER")
    verification_code_retention_days: int = Field(default=1, validation_alias="VERIFICATION_CODE_RETENTION_DAYS")
    check_attempt_retention_days: int = Field(default=30, validation_alias="CHECK_ATTEMPT_RETENTION_DAYS")
    notification_retention_days: int = Field(default=90, validation_alias="NOTIFICATION_RETENTION_DAYS")
    electricity_reading_retention_days: int = Field(default=365, validation_alias="ELECTRICITY_READING_RETENTION_DAYS")
    admin_audit_log_retention_days: int = Field(default=365, validation_alias="ADMIN_AUDIT_LOG_RETENTION_DAYS")
    retention_cleanup_hour: int = Field(default=3, validation_alias="RETENTION_CLEANUP_HOUR")
    upload_dir: str = Field(default="./uploads", validation_alias="UPLOAD_DIR")
    appearance_upload_max_bytes: int = Field(
        default=5 * 1024 * 1024,
        ge=64 * 1024,
        le=100 * 1024 * 1024,
        validation_alias="APPEARANCE_UPLOAD_MAX_BYTES",
    )
    max_request_body_bytes: int = Field(
        default=1024 * 1024,
        ge=16 * 1024,
        le=10 * 1024 * 1024,
        validation_alias="MAX_REQUEST_BODY_BYTES",
    )

    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=465, validation_alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, validation_alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    smtp_from_email: str | None = Field(default=None, validation_alias="SMTP_FROM_EMAIL")
    smtp_use_ssl: bool = Field(default=True, validation_alias="SMTP_USE_SSL")
    smtp_use_starttls: bool = Field(default=False, validation_alias="SMTP_USE_STARTTLS")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def validate_runtime_safety() -> None:
    if settings.debug or settings.allow_insecure_startup:
        return

    insecure_secret_values = {
        "dev-secret-change-me-before-deploy",
        "change-this-dev-secret-before-deploy",
        "change-this-secret",
    }
    if settings.secret_key in insecure_secret_values or len(settings.secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be changed to a random value of at least 32 characters when APP_DEBUG=false")
    if not settings.credential_encryption_key or len(settings.credential_encryption_key) < 32:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY must be a random value of at least 32 characters when APP_DEBUG=false")

    database_url_lower = settings.database_url.lower()
    if "change-this" in database_url_lower or "change_this" in database_url_lower:
        raise RuntimeError("DATABASE_URL still contains a placeholder password when APP_DEBUG=false")

    if settings.smtp_username and not settings.smtp_use_ssl and not settings.smtp_use_starttls:
        raise RuntimeError("SMTP credentials require SMTP_USE_SSL=true or SMTP_USE_STARTTLS=true")

    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    if "*" in origins:
        raise RuntimeError("CORS_ORIGINS must not include '*' when APP_DEBUG=false")

    trusted_hosts = [host.strip() for host in settings.trusted_hosts.split(",") if host.strip()]
    if "*" in trusted_hosts:
        raise RuntimeError("TRUSTED_HOSTS must not include '*' when APP_DEBUG=false")

    try:
        for value in settings.trusted_proxy_cidrs.split(","):
            if value.strip():
                ip_network(value.strip(), strict=False)
    except ValueError as exc:
        raise RuntimeError("TRUSTED_PROXY_CIDRS contains an invalid IP address or network") from exc
