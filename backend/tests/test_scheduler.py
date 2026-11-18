import asyncio
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
import pytest

from app.services import scheduler


def test_scheduler_disabled(monkeypatch):
    monkeypatch.setattr(scheduler, "settings", SimpleNamespace(background_tasks_enabled=False))
    app = FastAPI()
    scheduler.start_background_tasks(app)
    assert app.state.background_tasks == []


def test_scheduler_starts_once_and_cancels_both_runners(monkeypatch):
    monkeypatch.setattr(scheduler, "settings", SimpleNamespace(
        background_tasks_enabled=True, check_interval_seconds=60, notify_interval_seconds=90,
    ))
    checks, notifications = Mock(), Mock()
    monkeypatch.setattr(scheduler, "run_room_checks", checks)
    monkeypatch.setattr(scheduler, "run_low_power_notifications", notifications)

    async def scenario():
        app = FastAPI()
        both_started = asyncio.Event()
        waits = []

        async def pause(interval):
            waits.append(interval)
            if len(waits) == 2:
                both_started.set()
            await asyncio.Future()

        async def call(runner):
            runner()

        monkeypatch.setattr(scheduler, "asyncio", SimpleNamespace(
            create_task=asyncio.create_task, CancelledError=asyncio.CancelledError,
            to_thread=call, sleep=pause, gather=asyncio.gather,
        ))
        scheduler.start_background_tasks(app)
        tasks = tuple(app.state.background_tasks)
        scheduler.start_background_tasks(app)
        assert tuple(app.state.background_tasks) == tasks
        await asyncio.wait_for(both_started.wait(), timeout=1)
        await scheduler.stop_background_tasks(app)
        assert sorted(waits) == [60, 90]
        assert all(task.cancelled() for task in tasks)
        assert app.state.background_tasks == []

    asyncio.run(scenario())
    checks.assert_called_once_with(check_all=False, source="background")
    notifications.assert_called_once_with()


def test_periodic_runner_continues_after_failure_but_propagates_cancellation(monkeypatch):
    async def call(runner):
        runner()

    async def pause(interval):
        assert interval == 60

    runner = Mock(side_effect=[ValueError("temporary failure"), asyncio.CancelledError()])
    monkeypatch.setattr(scheduler, "asyncio", SimpleNamespace(
        to_thread=call, sleep=pause, CancelledError=asyncio.CancelledError,
    ))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(scheduler._periodic_runner("test", 60, runner))
    assert runner.call_count == 2
