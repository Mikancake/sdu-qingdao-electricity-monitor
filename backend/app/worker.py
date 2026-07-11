import logging
import signal
import time
from datetime import datetime, timedelta
from typing import Callable

from app.db.session import SessionLocal
from app.services.data_retention import run_data_retention_cleanup
from app.services.notifications import run_daily_reports, run_low_power_notifications
from app.services.room_checks import run_room_checks
from app.services.runtime_settings import get_runtime_config
from app.services.scheduled_jobs import (
    ScheduledJobOutcome,
    current_daily_slot,
    latest_aligned_slot,
    run_scheduled_job,
    scheduled_job_succeeded,
)


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class WorkerState:
    stopping = False


state = WorkerState()


def next_aligned_time(now: datetime, interval_seconds: int) -> datetime:
    return latest_aligned_slot(now, interval_seconds) + timedelta(seconds=max(60, interval_seconds))


def next_daily_time(now: datetime, *, hour: int) -> datetime:
    target = now.replace(hour=max(0, min(23, hour)), minute=0, second=0, microsecond=0)
    return target + timedelta(days=1) if target <= now else target


def _handle_stop(signum, frame) -> None:  # noqa: ANN001
    state.stopping = True
    logger.info("worker stop requested by signal %s", signum)


def _log_outcome(outcome: ScheduledJobOutcome) -> None:
    if not outcome.executed:
        return
    if outcome.status == "failed":
        logger.error(
            "scheduled job failed: job=%s slot=%s error=%s",
            outcome.job_name,
            outcome.scheduled_for,
            outcome.error_message,
        )
        return
    logger.info(
        "scheduled job finished: job=%s slot=%s result=%s",
        outcome.job_name,
        outcome.scheduled_for,
        outcome.result,
    )


def _run_slot(
    job_name: str,
    scheduled_for: datetime | None,
    callback: Callable[[], object],
    completed_slots: dict[str, datetime],
    next_probe_at: dict[str, datetime],
    *,
    retry_seconds: int = 300,
    stale_seconds: int = 1800,
) -> ScheduledJobOutcome | None:
    if scheduled_for is None or completed_slots.get(job_name) == scheduled_for:
        return None
    now = datetime.now()
    if next_probe_at.get(job_name, datetime.min) > now:
        return None
    next_probe_at[job_name] = now + timedelta(seconds=30)
    outcome = run_scheduled_job(
        job_name,
        scheduled_for,
        callback,
        retry_seconds=retry_seconds,
        stale_seconds=stale_seconds,
    )
    _log_outcome(outcome)
    if outcome.status == "succeeded":
        completed_slots[job_name] = scheduled_for
    return outcome


def main() -> int:
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    completed_slots: dict[str, datetime] = {}
    next_probe_at: dict[str, datetime] = {}
    logger.info("worker started; persistent catch-up scheduling enabled")

    while not state.stopping:
        try:
            with SessionLocal() as db:
                runtime = get_runtime_config(db)

            now = datetime.now()
            check_slot = latest_aligned_slot(now, runtime.check_interval_seconds)
            check_outcome = _run_slot(
                "room_checks",
                check_slot,
                lambda: run_room_checks(check_all=True, source="worker", use_batch_limit=False),
                completed_slots,
                next_probe_at,
                stale_seconds=7200,
            )
            if (check_outcome is not None and check_outcome.status == "succeeded") or scheduled_job_succeeded(
                "room_checks", check_slot
            ):
                _run_slot(
                    "post_check_notifications",
                    check_slot,
                    run_low_power_notifications,
                    completed_slots,
                    next_probe_at,
                )

            notify_slot = latest_aligned_slot(now, runtime.notify_interval_seconds)
            _run_slot(
                "low_power_notifications",
                notify_slot,
                run_low_power_notifications,
                completed_slots,
                next_probe_at,
            )

            _run_slot(
                "daily_reports",
                current_daily_slot(now, hour=8),
                run_daily_reports,
                completed_slots,
                next_probe_at,
            )
            _run_slot(
                "data_retention",
                current_daily_slot(now, hour=runtime.retention_cleanup_hour),
                run_data_retention_cleanup,
                completed_slots,
                next_probe_at,
            )
        except Exception:
            logger.exception("worker loop failed; retrying without stopping the process")

        time.sleep(max(1, runtime.worker_idle_seconds if "runtime" in locals() else 5))

    logger.info("worker stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
