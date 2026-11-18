from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, create_autospec

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import worker
from app.models import AppSetting, ScheduledJobRun
from app.services import scheduled_jobs


class FixedTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 7, 11, 12, 5, tzinfo=tz)


@pytest.mark.parametrize("previous", [None, "succeeded", "running"])
def test_worker_recovers_current_slot_and_gates_post_check(monkeypatch, previous):
    engine = create_engine("sqlite://")
    AppSetting.__table__.create(engine)
    ScheduledJobRun.__table__.create(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(worker, "SessionLocal", sessions)
    monkeypatch.setattr(scheduled_jobs, "SessionLocal", sessions)
    monkeypatch.setattr(scheduled_jobs, "now_like", lambda *_: FixedTime.now())
    monkeypatch.setattr(worker, "datetime", FixedTime)
    # Keep this independent of the machine's .env and of the signal handlers.
    monkeypatch.setattr(worker, "get_runtime_config", lambda db: SimpleNamespace(
        check_interval_seconds=3600, notify_interval_seconds=3600,
        hwgl_metadata_sync_interval_seconds=86400, retention_cleanup_hour=3, worker_idle_seconds=1,
    ))
    monkeypatch.setattr(worker, "signal", SimpleNamespace(SIGINT=2, SIGTERM=15, signal=Mock()))
    monkeypatch.setattr(worker, "state", worker.WorkerState())
    if previous:
        with sessions.begin() as db:
            db.add(ScheduledJobRun(job_name="room_checks", scheduled_for=FixedTime.now().replace(minute=0),
                                   status=previous, started_at=FixedTime.now()))

    callbacks = {}
    for name in ("run_room_checks", "run_low_power_notifications", "run_daily_reports",
                 "run_hwgl_metadata_sync", "run_data_retention_cleanup", "run_hwgl_probe_jobs"):
        callbacks[name] = create_autospec(getattr(worker, name), return_value=None)
        monkeypatch.setattr(worker, name, callbacks[name])

    callbacks["run_daily_reports"].return_value = worker.DailyReportBatchResult(1, int(bool(previous)), 0, int(not previous))

    ticks = 0

    def idle(_seconds):
        nonlocal ticks
        ticks += 1
        if ticks == 2:
            worker._handle_stop(15, None)

    monkeypatch.setattr(worker, "time", SimpleNamespace(sleep=idle))
    assert worker.main() == 0
    assert callbacks["run_hwgl_probe_jobs"].call_count == 2
    with sessions() as db:
        daily = db.query(ScheduledJobRun).filter_by(job_name="daily_reports").one()
        assert daily.status == ("succeeded" if previous else "failed")
        assert (daily.next_retry_at is not None) == (not previous)
    if previous is None:
        callbacks["run_room_checks"].assert_called_once_with(check_all=True, source="worker", use_batch_limit=False)
    else:
        callbacks["run_room_checks"].assert_not_called()
    assert callbacks["run_low_power_notifications"].call_count == (1 if previous == "running" else 2)
    for name in ("run_daily_reports", "run_hwgl_metadata_sync", "run_data_retention_cleanup"):
        callbacks[name].assert_called_once_with()


def test_next_aligned_time_resets_at_midnight_for_intraday_schedule():
    assert worker.next_aligned_time(datetime(2026, 7, 11, 23), 5 * 3600) == datetime(2026, 7, 12)
