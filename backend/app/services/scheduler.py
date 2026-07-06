import asyncio
import logging
from collections.abc import Callable

from fastapi import FastAPI

from app.core.config import settings
from app.services.notifications import run_low_power_notifications
from app.services.room_checks import run_room_checks


logger = logging.getLogger(__name__)


async def _periodic_runner(name: str, interval_seconds: int, runner: Callable[[], object]) -> None:
    while True:
        try:
            await asyncio.to_thread(runner)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("background task failed: %s", name)
        await asyncio.sleep(interval_seconds)


def start_background_tasks(app: FastAPI) -> None:
    if not settings.background_tasks_enabled:
        app.state.background_tasks = []
        return

    app.state.background_tasks = [
        asyncio.create_task(
            _periodic_runner(
                "room-checks",
                settings.check_interval_seconds,
                lambda: run_room_checks(check_all=False, source="background"),
            )
        ),
        asyncio.create_task(
            _periodic_runner(
                "low-power-notifications",
                settings.notify_interval_seconds,
                run_low_power_notifications,
            )
        ),
    ]


async def stop_background_tasks(app: FastAPI) -> None:
    tasks = getattr(app.state, "background_tasks", [])
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
