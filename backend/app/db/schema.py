import re

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
    _ensure_column(engine, "rooms", "provider", "ALTER TABLE rooms ADD COLUMN provider VARCHAR(20) DEFAULT 'mcard'")
    _ensure_column(engine, "rooms", "provider_room_key", "ALTER TABLE rooms ADD COLUMN provider_room_key VARCHAR(80)")
    _ensure_column(engine, "rooms", "provider_line_id", "ALTER TABLE rooms ADD COLUMN provider_line_id VARCHAR(40)")
    _ensure_column(engine, "rooms", "provider_campus", "ALTER TABLE rooms ADD COLUMN provider_campus VARCHAR(120)")
    _ensure_column(engine, "rooms", "provider_building", "ALTER TABLE rooms ADD COLUMN provider_building VARCHAR(120)")
    _ensure_column(engine, "rooms", "provider_floor", "ALTER TABLE rooms ADD COLUMN provider_floor VARCHAR(40)")
    _ensure_column(
        engine,
        "rooms",
        "probe_only",
        "ALTER TABLE rooms ADD COLUMN probe_only BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _ensure_column(engine, "rooms", "provider_price", "ALTER TABLE rooms ADD COLUMN provider_price NUMERIC(10, 4)")
    _ensure_column(
        engine,
        "rooms",
        "provider_price_updated_at",
        "ALTER TABLE rooms ADD COLUMN provider_price_updated_at TIMESTAMP",
    )

    _ensure_column(
        engine,
        "electricity_readings",
        "provider",
        "ALTER TABLE electricity_readings ADD COLUMN provider VARCHAR(20) DEFAULT 'mcard'",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "provider_updated_at",
        "ALTER TABLE electricity_readings ADD COLUMN provider_updated_at TIMESTAMP",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "reported_daily_usage",
        "ALTER TABLE electricity_readings ADD COLUMN reported_daily_usage NUMERIC(10, 4)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "reported_usage_date",
        "ALTER TABLE electricity_readings ADD COLUMN reported_usage_date DATE",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "power_status",
        "ALTER TABLE electricity_readings ADD COLUMN power_status VARCHAR(80)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "free_electricity",
        "ALTER TABLE electricity_readings ADD COLUMN free_electricity NUMERIC(10, 4)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "paid_electricity",
        "ALTER TABLE electricity_readings ADD COLUMN paid_electricity NUMERIC(10, 4)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "arrears_electricity",
        "ALTER TABLE electricity_readings ADD COLUMN arrears_electricity NUMERIC(10, 4)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "electricity_price",
        "ALTER TABLE electricity_readings ADD COLUMN electricity_price NUMERIC(10, 4)",
    )
    _ensure_column(
        engine,
        "electricity_readings",
        "estimated_amount",
        "ALTER TABLE electricity_readings ADD COLUMN estimated_amount NUMERIC(10, 2)",
    )

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
        conn.execute(text("UPDATE rooms SET provider = 'mcard' WHERE provider IS NULL OR provider = ''"))
        conn.execute(text("UPDATE rooms SET probe_only = FALSE WHERE probe_only IS NULL"))
        conn.execute(
            text("UPDATE electricity_readings SET provider = 'mcard' WHERE provider IS NULL OR provider = ''")
        )
        legacy_rooms = list(
            conn.execute(
                text(
                    """
                    SELECT id, room_number, building_key, provider_building
                    FROM rooms
                    WHERE building_key IN ('fenghuang_11', 'fenghuang_13', 'fenghuang_11_13')
                       OR building_param IN (
                           'hwgl&凤凰居11公寓',
                           'hwgl&凤凰居13公寓',
                           'hwgl&凤凰居11/13号楼',
                           '1599193777&凤凰居11/13号楼'
                       )
                    """
                )
            ).mappings()
        )
        for room in legacy_rooms:
            match = re.search(r"(\d{3})$", str(room["room_number"] or "").strip())
            number = int(match.group(1)) if match else None
            provider_building = str(room["provider_building"] or "").strip() or None
            if provider_building not in {"凤凰居11公寓", "凤凰居13公寓"}:
                provider_building = None
            if provider_building is None and room["building_key"] == "fenghuang_11":
                provider_building = "凤凰居11公寓"
            elif provider_building is None and room["building_key"] == "fenghuang_13":
                provider_building = "凤凰居13公寓"
            elif provider_building is None and number is not None and (
                108 <= number <= 119
                or 201 <= number <= 219
                or 301 <= number <= 319
                or 401 <= number <= 419
            ):
                provider_building = "凤凰居11公寓"
            elif provider_building is None and number is not None and (
                220 <= number <= 242
                or 320 <= number <= 344
                or 420 <= number <= 445
                or 501 <= number <= 523
                or 601 <= number <= 618
            ):
                provider_building = "凤凰居13公寓"
            conn.execute(
                text(
                    """
                    UPDATE rooms
                        SET provider = 'hwgl',
                        building_key = 'fenghuang_11_13',
                        building_name = '凤凰居11/13号楼',
                        building_param = 'hwgl&凤凰居11/13号楼',
                        provider_campus = '山东大学青岛校区',
                        provider_building = :provider_building
                    WHERE id = :room_id
                    """
                ),
                {
                    "room_id": room["id"],
                    "provider_building": provider_building,
                },
            )
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


def _ensure_performance_indexes(engine: Engine) -> None:
    indexes = {
        "ix_electricity_readings_room_read_at": ("electricity_readings", "room_id, read_at"),
        "ix_electricity_readings_room_provider_updated": (
            "electricity_readings",
            "room_id, provider_updated_at",
        ),
        "ix_electricity_readings_room_reported_date": (
            "electricity_readings",
            "room_id, reported_usage_date",
        ),
        "ix_electricity_readings_provider": ("electricity_readings", "provider"),
        "ix_rooms_provider": ("rooms", "provider"),
        "ix_rooms_provider_room_key": ("rooms", "provider, provider_room_key"),
        "ix_rooms_provider_probe_only": ("rooms", "provider, probe_only"),
        "ix_electricity_recharges_room_paid_at": ("electricity_recharges", "room_id, paid_at"),
        "ix_hwgl_probe_sessions_status_next_run": ("hwgl_probe_sessions", "status, next_run_at"),
        "ix_hwgl_probe_samples_session_requested": ("hwgl_probe_samples", "session_id, requested_at"),
        "ix_notifications_binding_kind_status_created": (
            "notifications",
            "user_room_id, kind, status, created_at",
        ),
        "ix_email_delivery_logs_status_sent_at": ("email_delivery_logs", "status, sent_at"),
        "ix_email_verification_codes_email_purpose_expires": (
            "email_verification_codes",
            "email, purpose, expires_at",
        ),
        "ix_user_rooms_enabled_room": ("user_rooms", "enabled, room_id"),
    }
    with engine.begin() as conn:
        for name, (table_name, columns) in indexes.items():
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table_name} ({columns})"))


def create_schema(engine: Engine, *, ensure_admin: bool = True) -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_existing_columns(engine)
    _ensure_existing_columns(engine)
    _ensure_secret_column_types(engine)
    _ensure_performance_indexes(engine)
    _backfill_existing_data(engine)
    if not ensure_admin:
        return
    with SessionLocal() as db:
        ensure_initial_admin(db)
