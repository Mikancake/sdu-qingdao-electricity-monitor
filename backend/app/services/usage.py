from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.electricity_reading import ElectricityReading


TWOPLACES = Decimal("0.01")


@dataclass(frozen=True)
class UsageStats:
    latest_balance: Decimal | None
    latest_read_at: datetime | None
    average_daily_usage: Decimal | None
    days_remaining: Decimal | None
    alert_threshold: Decimal | None
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


def calculate_average_daily_usage(readings: list[ElectricityReading]) -> Decimal | None:
    if len(readings) < 2:
        return None

    ordered = sorted(readings, key=lambda item: item.read_at)
    consumption = Decimal("0")
    measured_seconds = Decimal("0")

    previous = ordered[0]
    for current in ordered[1:]:
        seconds = Decimal(str(max((current.read_at - previous.read_at).total_seconds(), 0)))
        if seconds > 0 and current.balance < previous.balance:
            consumption += previous.balance - current.balance
            measured_seconds += seconds
        previous = current

    if consumption <= 0 or measured_seconds <= 0:
        return None

    days = measured_seconds / Decimal("86400")
    if days <= 0:
        return None
    return consumption / days


def build_usage_stats(
    readings: list[ElectricityReading],
    *,
    alert_days: int,
    fixed_threshold: Decimal | None,
) -> UsageStats:
    if not readings:
        return UsageStats(
            latest_balance=None,
            latest_read_at=None,
            average_daily_usage=None,
            days_remaining=None,
            alert_threshold=fixed_threshold,
            is_low_power=False,
            status="unknown",
        )

    ordered = sorted(readings, key=lambda item: item.read_at)
    latest = ordered[-1]
    average = calculate_average_daily_usage(ordered)
    if average is None:
        average = Decimal(str(settings.default_daily_usage_kwh))

    threshold = fixed_threshold if fixed_threshold is not None else average * Decimal(alert_days)
    days_remaining = latest.balance / average if average > 0 else None
    is_low_power = latest.balance <= threshold

    return UsageStats(
        latest_balance=round_decimal(latest.balance),
        latest_read_at=latest.read_at,
        average_daily_usage=round_decimal(average),
        days_remaining=round_decimal(days_remaining),
        alert_threshold=round_decimal(threshold),
        is_low_power=is_low_power,
        status="low" if is_low_power else "ok",
    )


def get_room_usage_stats(
    db: Session,
    room_id: int,
    *,
    alert_days: int,
    fixed_threshold: Decimal | None,
    days: int | None = None,
    limit: int = 200,
) -> tuple[UsageStats, list[ElectricityReading]]:
    readings = list_room_readings(
        db,
        room_id,
        days=days or settings.usage_history_days,
        limit=limit,
        ascending=True,
    )
    return build_usage_stats(readings, alert_days=alert_days, fixed_threshold=fixed_threshold), readings
