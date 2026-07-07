from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.admin_audit_log import AdminAuditLog
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.email_verification_code import EmailVerificationCode
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.notification import Notification
from app.services.runtime_settings import RuntimeConfig, get_runtime_config


@dataclass(frozen=True)
class DataRetentionCleanupResult:
    verification_codes_deleted: int = 0
    check_attempts_deleted: int = 0
    notifications_deleted: int = 0
    email_delivery_logs_deleted: int = 0
    electricity_readings_deleted: int = 0
    admin_audit_logs_deleted: int = 0

    @property
    def total_deleted(self) -> int:
        return (
            self.verification_codes_deleted
            + self.check_attempts_deleted
            + self.notifications_deleted
            + self.email_delivery_logs_deleted
            + self.electricity_readings_deleted
            + self.admin_audit_logs_deleted
        )


def _cutoff(days: int) -> datetime | None:
    if days <= 0:
        return None
    return datetime.now(timezone.utc) - timedelta(days=days)


def _rowcount(value: int | None) -> int:
    return int(value or 0)


def cleanup_data_retention(db: Session, runtime: RuntimeConfig | None = None) -> DataRetentionCleanupResult:
    runtime = runtime or get_runtime_config(db)

    verification_codes_deleted = 0
    check_attempts_deleted = 0
    notifications_deleted = 0
    email_delivery_logs_deleted = 0
    electricity_readings_deleted = 0
    admin_audit_logs_deleted = 0

    verification_cutoff = _cutoff(runtime.verification_code_retention_days)
    if verification_cutoff is not None:
        result = db.execute(delete(EmailVerificationCode).where(EmailVerificationCode.created_at < verification_cutoff))
        verification_codes_deleted = _rowcount(result.rowcount)

    check_attempt_cutoff = _cutoff(runtime.check_attempt_retention_days)
    if check_attempt_cutoff is not None:
        result = db.execute(delete(CheckAttempt).where(CheckAttempt.created_at < check_attempt_cutoff))
        check_attempts_deleted = _rowcount(result.rowcount)

    notification_cutoff = _cutoff(runtime.notification_retention_days)
    if notification_cutoff is not None:
        result = db.execute(delete(Notification).where(Notification.created_at < notification_cutoff))
        notifications_deleted = _rowcount(result.rowcount)
        result = db.execute(delete(EmailDeliveryLog).where(EmailDeliveryLog.created_at < notification_cutoff))
        email_delivery_logs_deleted = _rowcount(result.rowcount)

    reading_cutoff = _cutoff(runtime.electricity_reading_retention_days)
    if reading_cutoff is not None:
        old_reading_ids = select(ElectricityReading.id).where(ElectricityReading.read_at < reading_cutoff)
        db.execute(update(CheckAttempt).where(CheckAttempt.reading_id.in_(old_reading_ids)).values(reading_id=None))
        db.execute(update(Notification).where(Notification.reading_id.in_(old_reading_ids)).values(reading_id=None))
        result = db.execute(delete(ElectricityReading).where(ElectricityReading.read_at < reading_cutoff))
        electricity_readings_deleted = _rowcount(result.rowcount)

    audit_cutoff = _cutoff(runtime.admin_audit_log_retention_days)
    if audit_cutoff is not None:
        result = db.execute(delete(AdminAuditLog).where(AdminAuditLog.created_at < audit_cutoff))
        admin_audit_logs_deleted = _rowcount(result.rowcount)

    db.commit()
    return DataRetentionCleanupResult(
        verification_codes_deleted=verification_codes_deleted,
        check_attempts_deleted=check_attempts_deleted,
        notifications_deleted=notifications_deleted,
        email_delivery_logs_deleted=email_delivery_logs_deleted,
        electricity_readings_deleted=electricity_readings_deleted,
        admin_audit_logs_deleted=admin_audit_logs_deleted,
    )


def run_data_retention_cleanup() -> DataRetentionCleanupResult:
    with SessionLocal() as db:
        return cleanup_data_retention(db)
