from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Delete, delete, func, select, update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.admin_audit_log import AdminAuditLog
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.email_verification_code import EmailVerificationCode
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.notification import Notification
from app.models.scheduled_job_run import ScheduledJobRun
from app.models.hwgl_probe import HwglProbeSample, HwglProbeSession
from app.services.runtime_settings import RuntimeConfig, get_runtime_config


@dataclass(frozen=True)
class DataRetentionCleanupResult:
    verification_codes_deleted: int = 0
    check_attempts_deleted: int = 0
    notifications_deleted: int = 0
    email_delivery_logs_deleted: int = 0
    electricity_readings_deleted: int = 0
    admin_audit_logs_deleted: int = 0
    scheduled_job_runs_deleted: int = 0
    electricity_recharges_deleted: int = 0
    hwgl_probe_samples_deleted: int = 0
    hwgl_probe_sessions_deleted: int = 0

    @property
    def total_deleted(self) -> int:
        return (
            self.verification_codes_deleted
            + self.check_attempts_deleted
            + self.notifications_deleted
            + self.email_delivery_logs_deleted
            + self.electricity_readings_deleted
            + self.admin_audit_logs_deleted
            + self.scheduled_job_runs_deleted
            + self.electricity_recharges_deleted
            + self.hwgl_probe_samples_deleted
            + self.hwgl_probe_sessions_deleted
        )


def _cutoff(now: datetime, days: int) -> datetime | None:
    if days <= 0:
        return None
    return now - timedelta(days=days)


def _deleted(db: Session, statement: Delete) -> int:
    # The ORM's default in-memory evaluator can compare a naive SQLite
    # timestamp with an aware cutoff. Evaluate expiration in SQL instead.
    sync = "fetch" if db.identity_map else False
    result = db.execute(statement.execution_options(synchronize_session=sync))
    return int(result.rowcount or 0)


def cleanup_data_retention(db: Session, runtime: RuntimeConfig | None = None) -> DataRetentionCleanupResult:
    runtime = runtime or get_runtime_config(db)
    now = datetime.now(timezone.utc)

    verification_codes_deleted = 0
    check_attempts_deleted = 0
    notifications_deleted = 0
    email_delivery_logs_deleted = 0
    electricity_readings_deleted = 0
    admin_audit_logs_deleted = 0
    scheduled_job_runs_deleted = 0
    electricity_recharges_deleted = 0
    hwgl_probe_samples_deleted = 0
    hwgl_probe_sessions_deleted = 0

    verification_cutoff = _cutoff(now, runtime.verification_code_retention_days)
    if verification_cutoff is not None:
        verification_codes_deleted = _deleted(db, delete(EmailVerificationCode).where(EmailVerificationCode.created_at < verification_cutoff))

    check_attempt_cutoff = _cutoff(now, runtime.check_attempt_retention_days)
    if check_attempt_cutoff is not None:
        check_attempts_deleted = _deleted(db, delete(CheckAttempt).where(CheckAttempt.created_at < check_attempt_cutoff))

    notification_cutoff = _cutoff(now, runtime.notification_retention_days)
    if notification_cutoff is not None:
        old_notifications = select(Notification.id).where(Notification.created_at < notification_cutoff)
        # SQLite databases may not enforce ON DELETE SET NULL.
        db.execute(
            update(EmailDeliveryLog).where(EmailDeliveryLog.notification_id.in_(old_notifications)).values(notification_id=None)
        )
        notifications_deleted = _deleted(db, delete(Notification).where(Notification.created_at < notification_cutoff))
        email_delivery_logs_deleted = _deleted(db, delete(EmailDeliveryLog).where(EmailDeliveryLog.created_at < notification_cutoff))

    reading_cutoff = _cutoff(now, runtime.electricity_reading_retention_days)
    if reading_cutoff is not None:
        old_reading_ids = select(ElectricityReading.id).where(ElectricityReading.read_at < reading_cutoff)
        db.execute(update(CheckAttempt).where(CheckAttempt.reading_id.in_(old_reading_ids)).values(reading_id=None))
        db.execute(update(Notification).where(Notification.reading_id.in_(old_reading_ids)).values(reading_id=None))
        electricity_readings_deleted = _deleted(db, delete(ElectricityReading).where(ElectricityReading.read_at < reading_cutoff))

    audit_cutoff = _cutoff(now, runtime.admin_audit_log_retention_days)
    if audit_cutoff is not None:
        admin_audit_logs_deleted = _deleted(db, delete(AdminAuditLog).where(AdminAuditLog.created_at < audit_cutoff))

    scheduled_job_cutoff = _cutoff(now, runtime.scheduled_job_run_retention_days)
    if scheduled_job_cutoff is not None:
        scheduled_job_runs_deleted = _deleted(
            db,
            delete(ScheduledJobRun).where(
                ScheduledJobRun.created_at < scheduled_job_cutoff,
                ScheduledJobRun.status.in_(("succeeded", "failed")),
            ),
        )

    if reading_cutoff is not None:
        electricity_recharges_deleted = _deleted(db, delete(ElectricityRecharge).where(ElectricityRecharge.created_at < reading_cutoff))
    if scheduled_job_cutoff is not None:
        # A session and its samples are one report. Keep running reports
        # intact and expire completed reports as a unit, on either backend.
        expired = (
            HwglProbeSession.status.in_(("finished", "stopped", "failed")),
            func.coalesce(HwglProbeSession.finished_at, HwglProbeSession.created_at) < scheduled_job_cutoff,
        )
        expired_ids = select(HwglProbeSession.id).where(*expired)
        hwgl_probe_samples_deleted = _deleted(db, delete(HwglProbeSample).where(HwglProbeSample.session_id.in_(expired_ids)))
        hwgl_probe_sessions_deleted = _deleted(db, delete(HwglProbeSession).where(*expired))

    db.commit()
    return DataRetentionCleanupResult(
        verification_codes_deleted=verification_codes_deleted,
        check_attempts_deleted=check_attempts_deleted,
        notifications_deleted=notifications_deleted,
        email_delivery_logs_deleted=email_delivery_logs_deleted,
        electricity_readings_deleted=electricity_readings_deleted,
        admin_audit_logs_deleted=admin_audit_logs_deleted,
        scheduled_job_runs_deleted=scheduled_job_runs_deleted,
        electricity_recharges_deleted=electricity_recharges_deleted,
        hwgl_probe_samples_deleted=hwgl_probe_samples_deleted,
        hwgl_probe_sessions_deleted=hwgl_probe_sessions_deleted,
    )


def run_data_retention_cleanup() -> DataRetentionCleanupResult:
    with SessionLocal() as db:
        return cleanup_data_retention(db)
