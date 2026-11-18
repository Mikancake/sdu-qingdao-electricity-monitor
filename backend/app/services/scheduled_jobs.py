import json
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, TypeVar

from sqlalchemy import select, update
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
    anchor = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if interval > 24 * 60 * 60:
        # A midnight anchor that moves every day collapses multi-day intervals to one day.
        anchor = anchor.replace(year=1970, month=1, day=1)
    step = timedelta(seconds=interval)
    return anchor + ((now - anchor) // step) * step


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
    stale_seconds: int,
) -> tuple[int, int] | None:
    if run.status == "succeeded":
        return None
    if run.status == "running" and run.started_at > now - timedelta(seconds=max(60, stale_seconds)):
        return None
    if run.status == "failed" and run.next_retry_at is not None and run.next_retry_at > now:
        return None
    # SQLite does not implement SELECT FOR UPDATE. Compare-and-swap the
    # observed attempt so two workers cannot both reclaim this row.
    attempt = run.attempt_count + 1
    run_id = run.id
    claimed = db.execute(
        update(ScheduledJobRun)
        .where(
            ScheduledJobRun.id == run_id,
            ScheduledJobRun.status == run.status,
            ScheduledJobRun.attempt_count == run.attempt_count,
        )
        .values(
            status="running", attempt_count=attempt, started_at=now, finished_at=None,
            next_retry_at=None, error_message=None, details_json=None,
        )
    ).rowcount
    db.commit()
    return (run_id, attempt) if claimed else None


def claim_scheduled_job(
    job_name: str,
    scheduled_for: datetime,
    *,
    stale_seconds: int = 1800,
) -> tuple[int, int] | None:
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
                stale_seconds=stale_seconds,
            )

        now = now_like()
        run = ScheduledJobRun(
            job_name=job_name,
            scheduled_for=scheduled_for,
            status="running",
            attempt_count=1,
            started_at=now,
        )
        db.add(run)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return None
        return run.id, 1


def scheduled_job_succeeded(job_name: str, scheduled_for: datetime) -> bool:
    with SessionLocal() as db:
        status = db.scalar(
            select(ScheduledJobRun.status).where(
                ScheduledJobRun.job_name == job_name,
                ScheduledJobRun.scheduled_for == scheduled_for,
            )
        )
    return status == "succeeded"


def _finish_job(
    claim: tuple[int, int], *, status: str, retry_seconds: int,
    result: Any = None, error_message: str | None = None,
) -> bool:
    run_id, attempt = claim
    finished = now_like()
    with SessionLocal() as db:
        changed = db.execute(
            update(ScheduledJobRun)
            .where(
                ScheduledJobRun.id == run_id,
                ScheduledJobRun.attempt_count == attempt,
                ScheduledJobRun.status == "running",
            )
            .values(
                status=status,
                finished_at=finished,
                details_json=_result_json(result),
                next_retry_at=(finished + timedelta(seconds=max(30, retry_seconds)) if status == "failed" else None),
                error_message=error_message[:4000] if error_message else None,
            )
        ).rowcount
        db.commit()
        return bool(changed)


def run_scheduled_job(
    job_name: str,
    scheduled_for: datetime,
    callback: Callable[[], T],
    *,
    retry_seconds: int = 300,
    stale_seconds: int = 1800,
) -> ScheduledJobOutcome:
    claim = claim_scheduled_job(
        job_name,
        scheduled_for,
        stale_seconds=stale_seconds,
    )
    if claim is None:
        return ScheduledJobOutcome(job_name=job_name, scheduled_for=scheduled_for, executed=False, status="skipped")
    try:
        result = callback()
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        finished = _finish_job(claim, status="failed", retry_seconds=retry_seconds, error_message=message)
        return ScheduledJobOutcome(
            job_name=job_name,
            scheduled_for=scheduled_for,
            executed=True,
            status="failed" if finished else "superseded",
            error_message=message,
        )
    finished = _finish_job(claim, status="succeeded", retry_seconds=retry_seconds, result=result)
    return ScheduledJobOutcome(
        job_name=job_name,
        scheduled_for=scheduled_for,
        executed=True,
        status="succeeded" if finished else "superseded",
        result=result,
    )
