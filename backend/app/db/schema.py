from sqlalchemy import inspect, text
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


def create_schema(engine: Engine, *, ensure_admin: bool = True) -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_existing_columns(engine)
    if not ensure_admin:
        return
    with SessionLocal() as db:
        ensure_initial_admin(db)
