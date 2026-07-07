from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.electricity_reading import ElectricityReading
from app.services.runtime_settings import get_runtime_config


TWOPLACES = Decimal("0.01")
MIN_AVERAGE_WINDOW_SECONDS = Decimal("86400")


@dataclass(frozen=True)
class AverageDailyUsage:
    value: Decimal | None
    window_hours: Decimal | None


@dataclass(frozen=True)
class UsageStats:
    latest_balance: Decimal | None
    latest_read_at: datetime | None
    average_daily_usage: Decimal | None
    average_daily_usage_source: str
    usage_window_hours: Decimal | None
    days_remaining: Decimal | None
    days_remaining_source: str
    alert_threshold: Decimal | None
    alert_threshold_source: str
    is_low_power: bool
    status: str


def round_decimal(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def list_room_readings(
    db: Session,
    room_id: int,
    *,
    days: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    limit: int = 200,
    ascending: bool = False,
) -> list[ElectricityReading]:
    stmt = select(ElectricityReading).where(ElectricityReading.room_id == room_id)
    if days is not None:
        stmt = stmt.where(ElectricityReading.read_at >= datetime.now() - timedelta(days=days))
    if start_at is not None:
        stmt = stmt.where(ElectricityReading.read_at >= start_at)
    if end_at is not None:
        stmt = stmt.where(ElectricityReading.read_at <= end_at)
    order = ElectricityReading.read_at.asc() if ascending else ElectricityReading.read_at.desc()
    stmt = stmt.order_by(order).limit(limit)
    return list(db.scalars(stmt))


def calculate_average_daily_usage(readings: list[ElectricityReading]) -> AverageDailyUsage:
    if len(readings) < 2:
        return AverageDailyUsage(value=None, window_hours=None)

    ordered = sorted(readings, key=lambda item: item.read_at)
    total_window_seconds = Decimal(str(max((ordered[-1].read_at - ordered[0].read_at).total_seconds(), 0)))
    window_hours = total_window_seconds / Decimal("3600")
    if total_window_seconds < MIN_AVERAGE_WINDOW_SECONDS:
        return AverageDailyUsage(value=None, window_hours=window_hours)

    consumption = Decimal("0")

    previous = ordered[0]
    for current in ordered[1:]:
        if current.balance < previous.balance:
            consumption += previous.balance - current.balance
        previous = current

    if consumption <= 0:
        return AverageDailyUsage(value=None, window_hours=window_hours)

    days = total_window_seconds / Decimal("86400")
    if days <= 0:
        return AverageDailyUsage(value=None, window_hours=window_hours)
    return AverageDailyUsage(value=consumption / days, window_hours=window_hours)


def normalize_alert_threshold_mode(mode: str | None, fixed_threshold: Decimal | None) -> str:
    if mode in {"days", "average", "fixed"}:
        return mode
    return "fixed" if fixed_threshold is not None else "days"


def build_usage_stats(
    readings: list[ElectricityReading],
    *,
    alert_days: int,
    alert_threshold_mode: str | None,
    fixed_threshold: Decimal | None,
    default_daily_usage_kwh: float,
) -> UsageStats:
    threshold_mode = normalize_alert_threshold_mode(alert_threshold_mode, fixed_threshold)
    if not readings:
        return UsageStats(
            latest_balance=None,
            latest_read_at=None,
            average_daily_usage=None,
            average_daily_usage_source="unknown",
            usage_window_hours=None,
            days_remaining=None,
            days_remaining_source="unknown",
            alert_threshold=fixed_threshold if threshold_mode == "fixed" else None,
            alert_threshold_source="fixed" if threshold_mode == "fixed" and fixed_threshold is not None else "unknown",
            is_low_power=False,
            status="unknown",
        )

    ordered = sorted(readings, key=lambda item: item.read_at)
    latest = ordered[-1]
    measured_average = calculate_average_daily_usage(ordered)
    effective_average = measured_average.value or Decimal(str(default_daily_usage_kwh))
    average_source = "measured" if measured_average.value is not None else "insufficient"

    if threshold_mode == "fixed" and fixed_threshold is not None:
        threshold = fixed_threshold
        threshold_source = "fixed"
    elif threshold_mode == "average":
        threshold = effective_average
        threshold_source = "measured" if measured_average.value is not None else "default"
    else:
        threshold = effective_average * Decimal(alert_days)
        threshold_source = "measured" if measured_average.value is not None else "default"
    days_remaining = latest.balance / effective_average if effective_average > 0 else None
    days_remaining_source = "measured" if measured_average.value is not None else "default"
    is_low_power = latest.balance <= threshold

    return UsageStats(
        latest_balance=round_decimal(latest.balance),
        latest_read_at=latest.read_at,
        average_daily_usage=round_decimal(measured_average.value),
        average_daily_usage_source=average_source,
        usage_window_hours=round_decimal(measured_average.window_hours),
        days_remaining=round_decimal(days_remaining),
        days_remaining_source=days_remaining_source,
        alert_threshold=round_decimal(threshold),
        alert_threshold_source=threshold_source,
        is_low_power=is_low_power,
        status="low" if is_low_power else "ok",
    )


def get_room_usage_stats(
    db: Session,
    room_id: int,
    *,
    alert_days: int,
    alert_threshold_mode: str | None,
    fixed_threshold: Decimal | None,
    days: int | None = None,
    limit: int = 200,
) -> tuple[UsageStats, list[ElectricityReading]]:
    runtime = get_runtime_config(db)
    readings = list_room_readings(
        db,
        room_id,
        days=days or runtime.usage_history_days,
        limit=limit,
        ascending=True,
    )
    return (
        build_usage_stats(
            readings,
            alert_days=alert_days,
            alert_threshold_mode=alert_threshold_mode,
            fixed_threshold=fixed_threshold,
            default_daily_usage_kwh=runtime.default_daily_usage_kwh,
        ),
        readings,
    )
