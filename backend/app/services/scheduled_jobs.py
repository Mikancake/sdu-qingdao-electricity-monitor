import json
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, TypeVar

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.scheduled_job_run import ScheduledJobRun


T = TypeVar("T")


@dataclass(frozen=True)
class ScheduledJobOutcome:
    job_name: str
    scheduled_for: datetime
    executed: bool
    status: str
    result: Any | None = None
    error_message: str | None = None


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


def latest_aligned_slot(now: datetime, interval_seconds: int) -> datetime:
    interval = max(60, interval_seconds)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elapsed_seconds = max(0, int((now - midnight).total_seconds()))
    return midnight + timedelta(seconds=(elapsed_seconds // interval) * interval)


def current_daily_slot(now: datetime, *, hour: int) -> datetime | None:
    target = now.replace(hour=max(0, min(23, hour)), minute=0, second=0, microsecond=0)
    return target if now >= target else None


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime, Decimal)):
        return str(value)
    return repr(value)


def _result_json(value: Any) -> str | None:
    if value is None:
        return None
    payload = asdict(value) if is_dataclass(value) else value
    return json.dumps(payload, ensure_ascii=False, default=_json_default, separators=(",", ":"))


def _claim_existing(
    db: Session,
    run: ScheduledJobRun,
    *,
    now: datetime,
    retry_seconds: int,
    stale_seconds: int,
) -> int | None:
    if run.status == "succeeded":
        return None
    if run.status == "running" and run.started_at > now - timedelta(seconds=max(60, stale_seconds)):
        return None
    if run.status == "failed" and run.next_retry_at is not None and run.next_retry_at > now:
        return None
    run.status = "running"
    run.attempt_count += 1
    run.started_at = now
    run.finished_at = None
    run.next_retry_at = now + timedelta(seconds=max(30, retry_seconds))
    run.error_message = None
    db.commit()
    return run.id


def claim_scheduled_job(
    job_name: str,
    scheduled_for: datetime,
    *,
    retry_seconds: int = 300,
    stale_seconds: int = 1800,
) -> int | None:
    with SessionLocal() as db:
        run = db.scalar(
            select(ScheduledJobRun)
            .where(
                ScheduledJobRun.job_name == job_name,
                ScheduledJobRun.scheduled_for == scheduled_for,
            )
            .with_for_update()
        )
        if run is not None:
            now = now_like(run.started_at)
            return _claim_existing(
                db,
                run,
                now=now,
                retry_seconds=retry_seconds,
                stale_seconds=stale_seconds,
            )

        now = now_like(scheduled_for)
        run = ScheduledJobRun(
            job_name=job_name,
            scheduled_for=scheduled_for,
            status="running",
            attempt_count=1,
            started_at=now,
            next_retry_at=now + timedelta(seconds=max(30, retry_seconds)),
        )
        db.add(run)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return None
        return run.id


def scheduled_job_succeeded(job_name: str, scheduled_for: datetime) -> bool:
    with SessionLocal() as db:
        status = db.scalar(
            select(ScheduledJobRun.status).where(
                ScheduledJobRun.job_name == job_name,
                ScheduledJobRun.scheduled_for == scheduled_for,
            )
        )
    return status == "succeeded"


def _finish_job(run_id: int, *, status: str, result: Any = None, error_message: str | None = None) -> None:
    with SessionLocal() as db:
        run = db.get(ScheduledJobRun, run_id)
        if run is None:
            return
        run.status = status
        run.finished_at = now_like(run.started_at)
        run.next_retry_at = None if status == "succeeded" else run.next_retry_at
        run.details_json = _result_json(result)
        run.error_message = error_message[:4000] if error_message else None
        db.commit()


def run_scheduled_job(
    job_name: str,
    scheduled_for: datetime,
    callback: Callable[[], T],
    *,
    retry_seconds: int = 300,
    stale_seconds: int = 1800,
) -> ScheduledJobOutcome:
    run_id = claim_scheduled_job(
        job_name,
        scheduled_for,
        retry_seconds=retry_seconds,
        stale_seconds=stale_seconds,
    )
    if run_id is None:
        return ScheduledJobOutcome(job_name=job_name, scheduled_for=scheduled_for, executed=False, status="skipped")
    try:
        result = callback()
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        _finish_job(run_id, status="failed", error_message=message)
        return ScheduledJobOutcome(
            job_name=job_name,
            scheduled_for=scheduled_for,
            executed=True,
            status="failed",
            error_message=message,
        )
    _finish_job(run_id, status="succeeded", result=result)
    return ScheduledJobOutcome(
        job_name=job_name,
        scheduled_for=scheduled_for,
        executed=True,
        status="succeeded",
        result=result,
    )
