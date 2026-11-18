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



def test_multiday_interval_does_not_reset_at_every_midnight():
    interval = 2 * 86400
    now = datetime(2026, 7, 11, 15, 20)
    slot = scheduled_jobs.latest_aligned_slot(now, interval)
    assert slot <= now < slot + timedelta(seconds=interval)
    assert scheduled_jobs.latest_aligned_slot(slot + timedelta(days=1), interval) == slot
    assert scheduled_jobs.latest_aligned_slot(slot + timedelta(days=2), interval) == slot + timedelta(days=2)


def test_expired_attempt_cannot_overwrite_newer_success(monkeypatch):
    factory = _session_factory(monkeypatch)
    slot = now = datetime(2026, 7, 11, 8)
    monkeypatch.setattr(scheduled_jobs, "now_like", lambda *_: now)

    def slow_job():
        nonlocal now
        now += timedelta(hours=1)
        replacement = scheduled_jobs.run_scheduled_job("slow", slot, lambda: "new")
        assert replacement.status == "succeeded"
        raise RuntimeError("late error")

    late = scheduled_jobs.run_scheduled_job("slow", slot, slow_job)
    assert late.status == "superseded"
    with factory() as db:
        run = db.scalar(select(ScheduledJobRun))
        assert (run.attempt_count, run.status, run.details_json, run.error_message) == (2, "succeeded", '"new"', None)


def test_retry_delay_starts_after_long_running_failure(monkeypatch):
    _session_factory(monkeypatch)
    slot = now = datetime(2026, 7, 11, 8)
    monkeypatch.setattr(scheduled_jobs, "now_like", lambda *_: now)

    def fail():
        nonlocal now
        now += timedelta(minutes=10)
        raise RuntimeError("failed")

    assert scheduled_jobs.run_scheduled_job("slow", slot, fail, retry_seconds=60).status == "failed"
    now += timedelta(seconds=59)
    assert not scheduled_jobs.run_scheduled_job("slow", slot, lambda: 0).executed
    now += timedelta(seconds=1)
    assert scheduled_jobs.run_scheduled_job("slow", slot, lambda: 0).status == "succeeded"


def test_two_workers_observing_same_stale_attempt_cannot_both_reclaim(monkeypatch):
    factory = _session_factory(monkeypatch)
    now = datetime(2026, 7, 11, 10)
    started = now - timedelta(hours=1)
    with factory.begin() as db:
        db.add(ScheduledJobRun(job_name="slow", scheduled_for=started, status="running",
                               attempt_count=1, started_at=started))
    with factory() as first, factory() as second:
        first_view = first.scalar(select(ScheduledJobRun))
        second_view = second.scalar(select(ScheduledJobRun))
        # Both have already passed the SELECT on a backend without row locks.
        assert scheduled_jobs._claim_existing(first, first_view, now=now, stale_seconds=60) is not None
        assert scheduled_jobs._claim_existing(second, second_view, now=now, stale_seconds=60) is None
    with factory() as db:
        assert db.scalar(select(ScheduledJobRun.attempt_count)) == 2
