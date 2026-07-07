import logging
import signal
import time
from datetime import datetime, timedelta

from app.db.schema import create_schema
from app.db.session import SessionLocal, engine
from app.services.data_retention import run_data_retention_cleanup
from app.services.notifications import run_daily_reports, run_low_power_notifications
from app.services.room_checks import run_room_checks
from app.services.runtime_settings import get_runtime_config


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class WorkerState:
    stopping = False


state = WorkerState()


def next_aligned_time(now: datetime, interval_seconds: int) -> datetime:
    interval = max(60, interval_seconds)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elapsed_seconds = max(0, int((now - midnight).total_seconds()))
    current_slot = midnight + timedelta(seconds=(elapsed_seconds // interval) * interval)
    if current_slot <= now:
        current_slot += timedelta(seconds=interval)
    return current_slot


def next_daily_time(now: datetime, *, hour: int) -> datetime:
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target


def _handle_stop(signum, frame) -> None:  # noqa: ANN001
    state.stopping = True
    logger.info("worker stop requested by signal %s", signum)


def main() -> int:
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    create_schema(engine)
    with SessionLocal() as db:
        runtime = get_runtime_config(db)
    next_check_at = next_aligned_time(datetime.now(), runtime.check_interval_seconds)
    next_notify_at = datetime.now()
    next_daily_report_at = next_daily_time(datetime.now(), hour=8)
    next_cleanup_at = next_daily_time(datetime.now(), hour=runtime.retention_cleanup_hour)

    logger.info(
        "worker started; next_check_at=%s next_daily_report_at=%s next_cleanup_at=%s",
        next_check_at,
        next_daily_report_at,
        next_cleanup_at,
    )
    while not state.stopping:
        with SessionLocal() as db:
            runtime = get_runtime_config(db)

        now = datetime.now()
        if now >= next_check_at:
            result = run_room_checks(check_all=True, source="worker", use_batch_limit=False)
            logger.info("room checks: checked=%s succeeded=%s failed=%s", result.checked, result.succeeded, result.failed)
            notification_result = run_low_power_notifications()
            logger.info(
                "post-check notifications: scanned=%s sent=%s skipped=%s failed=%s",
                notification_result.scanned,
                notification_result.sent,
                notification_result.skipped,
                notification_result.failed,
            )
            next_check_at = next_aligned_time(datetime.now(), runtime.check_interval_seconds)
            next_notify_at = datetime.now() + timedelta(seconds=runtime.notify_interval_seconds)

        if now >= next_notify_at:
            result = run_low_power_notifications()
            logger.info(
                "notifications: scanned=%s sent=%s skipped=%s failed=%s",
                result.scanned,
                result.sent,
                result.skipped,
                result.failed,
            )
            next_notify_at = datetime.now() + timedelta(seconds=runtime.notify_interval_seconds)

        if now >= next_daily_report_at:
            result = run_daily_reports()
            logger.info(
                "daily reports: scanned=%s sent=%s skipped=%s failed=%s",
                result.scanned,
                result.sent,
                result.skipped,
                result.failed,
            )
            next_daily_report_at = next_daily_time(datetime.now(), hour=8)

        if now >= next_cleanup_at:
            result = run_data_retention_cleanup()
            logger.info(
                "data retention cleanup: verification_codes=%s check_attempts=%s notifications=%s readings=%s audit_logs=%s total=%s",
                result.verification_codes_deleted,
                result.check_attempts_deleted,
                result.notifications_deleted,
                result.electricity_readings_deleted,
                result.admin_audit_logs_deleted,
                result.total_deleted,
            )
            next_cleanup_at = next_daily_time(datetime.now(), hour=runtime.retention_cleanup_hour)

        time.sleep(runtime.worker_idle_seconds)

    logger.info("worker stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
