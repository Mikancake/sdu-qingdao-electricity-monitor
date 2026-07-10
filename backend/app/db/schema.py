from sqlalchemy import Text, inspect, text
from sqlalchemy.engine import Engine

from app import models  # noqa: F401
from app.db.base import Base
from app.db.session import SessionLocal
from app.services.admins import ensure_initial_admin


def _sqlite_columns(engine: Engine, table_name: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).mappings()
        return {str(row["name"]) for row in rows}


def _table_columns(engine: Engine, table_name: str) -> set[str]:
    if engine.dialect.name == "sqlite":
        return _sqlite_columns(engine, table_name)
    inspector = inspect(engine)
    return {str(column["name"]) for column in inspector.get_columns(table_name)}


def _ensure_column(engine: Engine, table_name: str, column_name: str, ddl: str) -> None:
    columns = _table_columns(engine, table_name)
    if column_name in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _ensure_sqlite_column(engine: Engine, table_name: str, column_name: str, ddl: str) -> None:
    if engine.dialect.name != "sqlite":
        return
    columns = _sqlite_columns(engine, table_name)
    if column_name in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _ensure_sqlite_existing_columns(engine: Engine) -> None:
    _ensure_sqlite_column(engine, "users", "notification_email", "ALTER TABLE users ADD COLUMN notification_email VARCHAR(255)")
    _ensure_sqlite_column(
        engine,
        "users",
        "notification_email_verified_at",
        "ALTER TABLE users ADD COLUMN notification_email_verified_at DATETIME",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "manual_check_cooldown_seconds",
        "ALTER TABLE users ADD COLUMN manual_check_cooldown_seconds INTEGER",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "notify_cooldown_hours",
        "ALTER TABLE users ADD COLUMN notify_cooldown_hours INTEGER",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "test_email_sent_at",
        "ALTER TABLE users ADD COLUMN test_email_sent_at DATETIME",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "daily_report_enabled",
        "ALTER TABLE users ADD COLUMN daily_report_enabled BOOLEAN DEFAULT 1",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "daily_report_interval_days",
        "ALTER TABLE users ADD COLUMN daily_report_interval_days INTEGER DEFAULT 1",
    )
    _ensure_sqlite_column(
        engine,
        "users",
        "daily_report_last_sent_at",
        "ALTER TABLE users ADD COLUMN daily_report_last_sent_at DATETIME",
    )
    _ensure_sqlite_column(
        engine,
        "user_rooms",
        "manual_check_cooldown_seconds",
        "ALTER TABLE user_rooms ADD COLUMN manual_check_cooldown_seconds INTEGER",
    )
    _ensure_sqlite_column(
        engine,
        "user_rooms",
        "notify_cooldown_hours",
        "ALTER TABLE user_rooms ADD COLUMN notify_cooldown_hours INTEGER",
    )
    _ensure_column(
        engine,
        "user_rooms",
        "alert_threshold_mode",
        "ALTER TABLE user_rooms ADD COLUMN alert_threshold_mode VARCHAR(20)",
    )
    _ensure_sqlite_column(
        engine,
        "email_verification_codes",
        "delivered_at",
        "ALTER TABLE email_verification_codes ADD COLUMN delivered_at DATETIME",
    )
    _ensure_sqlite_column(
        engine,
        "email_verification_codes",
        "password_hash",
        "ALTER TABLE email_verification_codes ADD COLUMN password_hash VARCHAR(255)",
    )


def _ensure_existing_columns(engine: Engine) -> None:
    _ensure_column(engine, "auth_tokens", "health_status", "ALTER TABLE auth_tokens ADD COLUMN health_status VARCHAR(40) DEFAULT 'unknown'")
    _ensure_column(engine, "auth_tokens", "failure_count", "ALTER TABLE auth_tokens ADD COLUMN failure_count INTEGER DEFAULT 0")
    _ensure_column(engine, "auth_tokens", "last_checked_at", "ALTER TABLE auth_tokens ADD COLUMN last_checked_at TIMESTAMP")
    _ensure_column(engine, "auth_tokens", "last_success_at", "ALTER TABLE auth_tokens ADD COLUMN last_success_at TIMESTAMP")
    _ensure_column(engine, "auth_tokens", "last_error_at", "ALTER TABLE auth_tokens ADD COLUMN last_error_at TIMESTAMP")
    _ensure_column(engine, "auth_tokens", "last_error_kind", "ALTER TABLE auth_tokens ADD COLUMN last_error_kind VARCHAR(80)")
    _ensure_column(engine, "auth_tokens", "last_error_msg", "ALTER TABLE auth_tokens ADD COLUMN last_error_msg TEXT")

    _ensure_column(engine, "smtp_settings", "name", "ALTER TABLE smtp_settings ADD COLUMN name VARCHAR(80)")
    _ensure_column(engine, "smtp_settings", "enabled", "ALTER TABLE smtp_settings ADD COLUMN enabled BOOLEAN DEFAULT TRUE")
    _ensure_column(engine, "smtp_settings", "min_interval_seconds", "ALTER TABLE smtp_settings ADD COLUMN min_interval_seconds INTEGER DEFAULT 0")
    _ensure_column(engine, "smtp_settings", "last_used_at", "ALTER TABLE smtp_settings ADD COLUMN last_used_at TIMESTAMP")
    _ensure_column(engine, "smtp_settings", "health_status", "ALTER TABLE smtp_settings ADD COLUMN health_status VARCHAR(40) DEFAULT 'unknown'")
    _ensure_column(engine, "smtp_settings", "failure_count", "ALTER TABLE smtp_settings ADD COLUMN failure_count INTEGER DEFAULT 0")
    _ensure_column(engine, "smtp_settings", "last_checked_at", "ALTER TABLE smtp_settings ADD COLUMN last_checked_at TIMESTAMP")
    _ensure_column(engine, "smtp_settings", "last_success_at", "ALTER TABLE smtp_settings ADD COLUMN last_success_at TIMESTAMP")
    _ensure_column(engine, "smtp_settings", "last_error_at", "ALTER TABLE smtp_settings ADD COLUMN last_error_at TIMESTAMP")
    _ensure_column(engine, "smtp_settings", "last_error_kind", "ALTER TABLE smtp_settings ADD COLUMN last_error_kind VARCHAR(80)")
    _ensure_column(engine, "smtp_settings", "last_error_msg", "ALTER TABLE smtp_settings ADD COLUMN last_error_msg VARCHAR(1024)")
    _ensure_column(engine, "smtp_settings", "created_at", "ALTER TABLE smtp_settings ADD COLUMN created_at TIMESTAMP")

    _ensure_column(engine, "email_delivery_logs", "notification_id", "ALTER TABLE email_delivery_logs ADD COLUMN notification_id INTEGER")


def _backfill_existing_data(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("UPDATE auth_tokens SET health_status = 'unknown' WHERE health_status IS NULL"))
        conn.execute(text("UPDATE auth_tokens SET failure_count = 0 WHERE failure_count IS NULL"))
        if engine.dialect.name == "sqlite":
            conn.execute(text("UPDATE smtp_settings SET name = 'smtp-' || id WHERE name IS NULL OR name = ''"))
        else:
            conn.execute(text("UPDATE smtp_settings SET name = CONCAT('smtp-', id) WHERE name IS NULL OR name = ''"))
        conn.execute(text("UPDATE smtp_settings SET enabled = TRUE WHERE enabled IS NULL"))
        conn.execute(text("UPDATE smtp_settings SET min_interval_seconds = 0 WHERE min_interval_seconds IS NULL"))
        conn.execute(text("UPDATE smtp_settings SET health_status = 'unknown' WHERE health_status IS NULL"))
        conn.execute(text("UPDATE smtp_settings SET failure_count = 0 WHERE failure_count IS NULL"))
        conn.execute(text("UPDATE smtp_settings SET created_at = updated_at WHERE created_at IS NULL AND updated_at IS NOT NULL"))
        conn.execute(text("UPDATE smtp_settings SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
        conn.execute(
            text(
                """
                INSERT INTO email_delivery_logs (
                    notification_id,
                    smtp_settings_id,
                    source,
                    recipient_email,
                    subject,
                    status,
                    error_msg,
                    created_at,
                    sent_at
                )
                SELECT
                    n.id,
                    NULL,
                    COALESCE(n.kind, 'low_power'),
                    n.recipient_email,
                    n.subject,
                    n.status,
                    n.error_msg,
                    n.created_at,
                    n.sent_at
                FROM notifications n
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM email_delivery_logs e
                    WHERE e.notification_id = n.id
                )
                """
            )
        )


def _ensure_secret_column_types(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    password_column = next(
        (column for column in inspect(engine).get_columns("smtp_settings") if column["name"] == "password"),
        None,
    )
    if password_column is None or isinstance(password_column["type"], Text):
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE smtp_settings ALTER COLUMN password TYPE TEXT"))


def create_schema(engine: Engine, *, ensure_admin: bool = True) -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_existing_columns(engine)
    _ensure_existing_columns(engine)
    _ensure_secret_column_types(engine)
    _backfill_existing_data(engine)
    if not ensure_admin:
        return
    with SessionLocal() as db:
        ensure_initial_admin(db)
