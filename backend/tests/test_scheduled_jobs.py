from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.scheduled_job_run import ScheduledJobRun
from app.services import scheduled_jobs


def _session_factory(monkeypatch):
    engine = create_engine("sqlite://")
    ScheduledJobRun.__table__.create(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(scheduled_jobs, "SessionLocal", factory)
    return factory


def test_slot_helpers_align_to_local_day() -> None:
    now = datetime(2026, 7, 11, 10, 37, 42)

    assert scheduled_jobs.latest_aligned_slot(now, 4 * 60 * 60) == datetime(2026, 7, 11, 8)
    assert scheduled_jobs.current_daily_slot(now, hour=8) == datetime(2026, 7, 11, 8)
    assert scheduled_jobs.current_daily_slot(now.replace(hour=7), hour=8) is None


def test_scheduled_job_runs_once_and_serializes_result(monkeypatch) -> None:
    factory = _session_factory(monkeypatch)
    slot = datetime(2026, 7, 11, 8, tzinfo=ZoneInfo("Asia/Shanghai"))

    @dataclass(frozen=True)
    class Result:
        checked: int

    first = scheduled_jobs.run_scheduled_job("room_checks", slot, lambda: Result(checked=7))
    second = scheduled_jobs.run_scheduled_job("room_checks", slot, lambda: Result(checked=99))

    assert first.executed is True
    assert first.status == "succeeded"
    assert second.executed is False
    assert second.status == "skipped"
    assert scheduled_jobs.scheduled_job_succeeded("room_checks", slot) is True

    with factory() as db:
        run = db.scalar(select(ScheduledJobRun))
        assert run is not None
        assert run.attempt_count == 1
        assert run.details_json == '{"checked":7}'


def test_failed_job_waits_then_can_retry(monkeypatch) -> None:
    factory = _session_factory(monkeypatch)
    slot = datetime(2026, 7, 11, 12)
    calls = 0

    def fail_once() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("temporary failure")
        return "ok"

    failed = scheduled_jobs.run_scheduled_job("daily_reports", slot, fail_once, retry_seconds=300)
    blocked = scheduled_jobs.run_scheduled_job("daily_reports", slot, fail_once, retry_seconds=300)

    assert failed.status == "failed"
    assert "temporary failure" in (failed.error_message or "")
    assert blocked.executed is False
    assert calls == 1

    with factory() as db:
        run = db.scalar(select(ScheduledJobRun))
        assert run is not None
        run.next_retry_at = datetime.now() - timedelta(seconds=1)
        db.commit()

    retried = scheduled_jobs.run_scheduled_job("daily_reports", slot, fail_once, retry_seconds=300)
    assert retried.status == "succeeded"
    assert calls == 2

    with factory() as db:
        run = db.scalar(select(ScheduledJobRun))
        assert run is not None
        assert run.attempt_count == 2

