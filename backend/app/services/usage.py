from bisect import bisect_right
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.room import Room
from app.services.runtime_settings import get_runtime_config


TWOPLACES = Decimal("0.01")


@dataclass(frozen=True)
class AverageDailyUsage:
    value: Decimal | None
    window_hours: Decimal | None
    source: str = "insufficient"
    sample_days: int = 0
    basis: str = "unknown"
    active_period_start: date | None = None
    active_period_end: date | None = None


@dataclass(frozen=True)
class UsageStats:
    latest_balance: Decimal | None
    latest_read_at: datetime | None
    latest_provider_updated_at: datetime | None
    latest_power_status: str | None
    average_daily_usage: Decimal | None
    average_daily_usage_source: str
    usage_window_hours: Decimal | None
    days_remaining: Decimal | None
    days_remaining_source: str
    alert_threshold: Decimal | None
    alert_threshold_source: str
    is_low_power: bool
    status: str
    estimated_daily_usage: Decimal | None = None
    estimated_daily_usage_source: str = "unknown"
    average_daily_usage_sample_days: int = 0
    average_daily_usage_basis: str = "unknown"
    active_period_start: date | None = None
    active_period_end: date | None = None
    free_electricity: Decimal | None = None
    paid_electricity: Decimal | None = None
    arrears_electricity: Decimal | None = None
    electricity_price: Decimal | None = None
    estimated_amount: Decimal | None = None


def round_decimal(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def reading_data_time(reading: ElectricityReading) -> datetime:
    return reading.provider_updated_at or reading.read_at


def datetime_key(value: datetime) -> float:
    return value.timestamp()


def list_room_readings(
    db: Session,
    room_id: int,
    *,
    provider: str | None = None,
    days: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    limit: int = 200,
    ascending: bool = False,
) -> list[ElectricityReading]:
    stmt = select(ElectricityReading).where(ElectricityReading.room_id == room_id)
    if provider is not None:
        stmt = stmt.where(ElectricityReading.provider == provider)
    data_at = func.coalesce(
        ElectricityReading.provider_updated_at, ElectricityReading.read_at
    )
    if days is not None:
        stmt = stmt.where(data_at >= datetime.now() - timedelta(days=days))
    if start_at is not None:
        stmt = stmt.where(data_at >= start_at)
    if end_at is not None:
        stmt = stmt.where(data_at <= end_at)
    if ascending:
        stmt = stmt.order_by(
            data_at.asc(), ElectricityReading.read_at.asc(), ElectricityReading.id.asc()
        )
    else:
        stmt = stmt.order_by(
            data_at.desc(),
            ElectricityReading.read_at.desc(),
            ElectricityReading.id.desc(),
        )
    stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


def reading_order_key(reading: ElectricityReading) -> tuple[float, float, int]:
    return (
        datetime_key(reading_data_time(reading)),
        datetime_key(reading.read_at),
        reading.id or 0,
    )


BALANCE_INCREASE_TOLERANCE_KWH = Decimal("0.05")
QUIET_DAILY_USAGE_KWH = Decimal("0.05")
SILENT_DAYS_TO_SPLIT_ACTIVE_PERIOD = 3
MIN_AVERAGE_WINDOW_SECONDS = Decimal("86400")
MIN_DROP_SAMPLES = 2


def _ordered_unique_readings(
    readings: list[ElectricityReading],
) -> list[ElectricityReading]:
    ordered = sorted(readings, key=reading_order_key)
    unique: list[ElectricityReading] = []
    for reading in ordered:
        if unique:
            previous = unique[-1]
            if reading.provider == previous.provider and reading_data_time(
                reading
            ) == reading_data_time(previous):
                unique[-1] = reading
                continue
        unique.append(reading)
    return unique


def _credit_increase(previous: ElectricityReading, current: ElectricityReading) -> bool:
    # HWGL component balances can reveal a grant even when concurrent usage
    # hides it in the total. Currency amounts are not metered kWh.
    return any(
        before is not None and after is not None and after - before > BALANCE_INCREASE_TOLERANCE_KWH
        for before, after in (
            (previous.balance, current.balance),
            (previous.free_electricity, current.free_electricity),
            (previous.paid_electricity, current.paid_electricity),
        )
    )


def calculate_average_daily_usage(
    readings: list[ElectricityReading], *, credited_at: tuple[datetime, ...] = (),
) -> AverageDailyUsage:
    """Estimate from observable intervals; an incoming credit hides one interval, not its history."""
    ordered = _ordered_unique_readings(readings)
    credits = sorted(datetime_key(t) for t in credited_at)
    seconds = consumption = quiet = Decimal(0)
    drops = 0
    first = last = None
    split_after = Decimal(SILENT_DAYS_TO_SPLIT_ACTIVE_PERIOD * 86400)
    for previous, current in zip(ordered, ordered[1:]):
        start, end = reading_data_time(previous), reading_data_time(current)
        t0, t1 = datetime_key(start), datetime_key(end)
        elapsed = Decimal(str(t1 - t0))
        boundary = current.provider != previous.provider or elapsed >= split_after
        if not boundary:
            # A payment at t0 is already reflected in the starting snapshot.
            i = bisect_right(credits, t0)
            if _credit_increase(previous, current) or (i < len(credits) and credits[i] <= t1):
                quiet = Decimal(0)
                continue
            drop = previous.balance - current.balance
            quiet = quiet + elapsed if drop <= QUIET_DAILY_USAGE_KWH else Decimal(0)
            boundary = quiet >= split_after
        if boundary:
            seconds = consumption = quiet = Decimal(0)
            drops = 0
            first = last = None
            continue
        first = first or start.date()
        last = end.date()
        seconds += elapsed
        if drop > QUIET_DAILY_USAGE_KWH:
            consumption += drop
            drops += 1

    usable = seconds >= MIN_AVERAGE_WINDOW_SECONDS and drops >= MIN_DROP_SAMPLES
    return AverageDailyUsage(
        value=consumption / (seconds / Decimal(86400)) if usable else None,
        window_hours=seconds / Decimal(3600),
        source="measured" if usable else "insufficient",
        sample_days=drops,
        basis="有效区间的余额下降量 / 有效观测时长（跳过充值和赠电区间）" if usable else "有效观测不足 24 小时或不足两次下降",
        active_period_start=first,
        active_period_end=last,
    )


def normalize_alert_threshold_mode(
    mode: str | None, fixed_threshold: Decimal | None
) -> str:
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
    room_price: Decimal | None = None,
    credited_at: tuple[datetime, ...] = (),
) -> UsageStats:
    threshold_mode = normalize_alert_threshold_mode(
        alert_threshold_mode, fixed_threshold
    )
    if not readings:
        return UsageStats(
            latest_balance=None,
            latest_read_at=None,
            latest_provider_updated_at=None,
            latest_power_status=None,
            average_daily_usage=None,
            average_daily_usage_source="unknown",
            usage_window_hours=None,
            days_remaining=None,
            days_remaining_source="unknown",
            alert_threshold=fixed_threshold if threshold_mode == "fixed" else None,
            alert_threshold_source="fixed"
            if threshold_mode == "fixed" and fixed_threshold is not None
            else "unknown",
            is_low_power=False,
            status="unknown",
            estimated_daily_usage=None,
            estimated_daily_usage_source="unknown",
        )

    ordered = sorted(readings, key=reading_order_key)
    latest = ordered[-1]
    measured_average = calculate_average_daily_usage(ordered, credited_at=credited_at)
    effective_average = measured_average.value or Decimal(str(default_daily_usage_kwh))
    average_source = (
        measured_average.source
        if measured_average.value is not None
        else "insufficient"
    )
    effective_source = (
        measured_average.source if measured_average.value is not None else "default"
    )

    if threshold_mode == "fixed" and fixed_threshold is not None:
        threshold = fixed_threshold
        threshold_source = "fixed"
    elif threshold_mode == "average":
        threshold = effective_average
        threshold_source = effective_source
    else:
        threshold = effective_average * Decimal(alert_days)
        threshold_source = effective_source
    days_remaining = (
        max(Decimal("0"), latest.balance) / effective_average if effective_average > 0 else None
    )
    days_remaining_source = effective_source
    is_low_power = latest.balance <= threshold

    current_price = latest.electricity_price if latest.electricity_price is not None else room_price
    estimated_amount = latest.estimated_amount
    if estimated_amount is None and current_price is not None:
        estimated_amount = latest.balance * current_price

    return UsageStats(
        latest_balance=round_decimal(latest.balance),
        latest_read_at=latest.read_at,
        latest_provider_updated_at=latest.provider_updated_at,
        latest_power_status=latest.power_status,
        average_daily_usage=round_decimal(measured_average.value),
        average_daily_usage_source=average_source,
        usage_window_hours=round_decimal(measured_average.window_hours),
        days_remaining=round_decimal(days_remaining),
        days_remaining_source=days_remaining_source,
        alert_threshold=round_decimal(threshold),
        alert_threshold_source=threshold_source,
        is_low_power=is_low_power,
        status="low" if is_low_power else "ok",
        estimated_daily_usage=round_decimal(effective_average),
        estimated_daily_usage_source=effective_source,
        average_daily_usage_sample_days=measured_average.sample_days,
        average_daily_usage_basis=measured_average.basis,
        active_period_start=measured_average.active_period_start,
        active_period_end=measured_average.active_period_end,
        free_electricity=round_decimal(latest.free_electricity),
        paid_electricity=round_decimal(latest.paid_electricity),
        arrears_electricity=round_decimal(latest.arrears_electricity),
        electricity_price=round_decimal(current_price),
        estimated_amount=round_decimal(estimated_amount),
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
    provider: str | None = None,
) -> tuple[UsageStats, list[ElectricityReading]]:
    runtime = get_runtime_config(db)
    room = db.get(Room, room_id)
    current_provider = provider or (room.provider if room is not None else None)
    readings = list_room_readings(
        db,
        room_id,
        provider=current_provider,
        days=days or runtime.usage_history_days,
        limit=limit,
        ascending=False,
    )
    # Limit the newest points before restoring the chronological order used
    # by charts and notification.reading_id (readings[-1]).
    readings.reverse()
    credited_at: tuple[datetime, ...] = ()
    if current_provider == "hwgl" and len(readings) > 1:
        # Only completed credits are evidence; pending/failed orders and
        # orders without a timestamp cannot identify a contaminated interval.
        credited_at = tuple(db.scalars(select(ElectricityRecharge.paid_at).where(
            ElectricityRecharge.room_id == room_id,
            ElectricityRecharge.provider == current_provider,
            ElectricityRecharge.processing_status == "已入账",
            ElectricityRecharge.paid_at > reading_data_time(readings[0]),
            ElectricityRecharge.paid_at <= reading_data_time(readings[-1]),
        )))
    return (
        build_usage_stats(
            readings,
            alert_days=alert_days,
            alert_threshold_mode=alert_threshold_mode,
            fixed_threshold=fixed_threshold,
            default_daily_usage_kwh=runtime.default_daily_usage_kwh,
            room_price=room.provider_price if room is not None else None,
            credited_at=credited_at,
        ),
        readings,
    )
