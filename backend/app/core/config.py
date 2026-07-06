from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="SDU Electricity Platform", validation_alias="APP_NAME")
    debug: bool = Field(default=True, validation_alias="APP_DEBUG")
    secret_key: str = Field(default="dev-secret-change-me-before-deploy", validation_alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=60 * 24 * 7, validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES")
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
    default_alert_days: int = Field(default=3, validation_alias="DEFAULT_ALERT_DAYS")
    default_daily_usage_kwh: float = Field(default=5.0, validation_alias="DEFAULT_DAILY_USAGE_KWH")
    usage_history_days: int = Field(default=14, validation_alias="USAGE_HISTORY_DAYS")

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
