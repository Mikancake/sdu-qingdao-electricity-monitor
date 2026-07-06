from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.app_setting import AppSetting


@dataclass(frozen=True)
class RuntimeConfig:
    check_interval_seconds: int = settings.check_interval_seconds
    check_batch_size: int = settings.check_batch_size
    check_request_delay_seconds: float = settings.check_request_delay_seconds
    notify_interval_seconds: int = settings.notify_interval_seconds
    notify_cooldown_hours: int = settings.notify_cooldown_hours
    default_alert_days: int = settings.default_alert_days
    default_daily_usage_kwh: float = settings.default_daily_usage_kwh
    usage_history_days: int = settings.usage_history_days
    manual_check_cooldown_seconds: int = 300
    worker_idle_seconds: int = 10


RUNTIME_DEFAULTS = RuntimeConfig()


def _cast_value(key: str, value: str) -> int | float | str:
    default = getattr(RUNTIME_DEFAULTS, key)
    if isinstance(default, int):
        return int(float(value))
    if isinstance(default, float):
        return float(value)
    return value


def get_runtime_config(db: Session) -> RuntimeConfig:
    values = asdict(RUNTIME_DEFAULTS)
    rows = db.scalars(select(AppSetting).where(AppSetting.key.in_(values.keys())))
    for row in rows:
        try:
            values[row.key] = _cast_value(row.key, row.value)
        except (TypeError, ValueError):
            continue
    return RuntimeConfig(**values)


def update_runtime_config(db: Session, updates: dict[str, Any]) -> RuntimeConfig:
    allowed = asdict(RUNTIME_DEFAULTS)
    for key, value in updates.items():
        if key not in allowed or value is None:
            continue
        row = db.scalar(select(AppSetting).where(AppSetting.key == key))
        if row is None:
            row = AppSetting(key=key, value=str(value))
            db.add(row)
        else:
            row.value = str(value)
    db.commit()
    return get_runtime_config(db)
