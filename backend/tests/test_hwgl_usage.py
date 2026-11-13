from datetime import date, datetime, timedelta
from decimal import Decimal

from app.models.electricity_reading import ElectricityReading
from app.services.usage import build_usage_stats, calculate_average_daily_usage


def reading(
    reading_id: int,
    balance: str,
    read_at: datetime,
    *,
    provider: str = "mcard",
    daily_usage: str | None = None,
    usage_date: date | None = None,
    provider_updated_at: datetime | None = None,
) -> ElectricityReading:
    return ElectricityReading(
        id=reading_id,
        room_id=1,
        balance=Decimal(balance),
        source="test",
        provider=provider,
        read_at=read_at,
        reported_daily_usage=Decimal(daily_usage) if daily_usage is not None else None,
        reported_usage_date=usage_date,
        provider_updated_at=provider_updated_at,
    )


def test_balance_drop_ignores_reported_daily_usage() -> None:
    base = datetime(2026, 8, 25, 8)
    readings = [
        reading(
            1,
            "70.00",
            base,
            provider="hwgl",
            daily_usage="3.80",
            usage_date=date(2026, 8, 24),
        ),
        reading(
            2,
            "66.20",
            base + timedelta(hours=4),
            provider="hwgl",
            daily_usage="3.80",
            usage_date=date(2026, 8, 24),
        ),
        reading(
            3,
            "61.20",
            base + timedelta(days=1),
            provider="hwgl",
            daily_usage="5.00",
            usage_date=date(2026, 8, 25),
        ),
        reading(
            4,
            "61.20",
            base + timedelta(days=2),
            provider="hwgl",
            daily_usage="0",
            usage_date=date(2026, 8, 26),
        ),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("4.40")
    assert average.window_hours == Decimal("48")


def test_balance_fallback_averages_each_active_day() -> None:
    base = datetime(2026, 8, 24, 8)
    readings = [
        reading(1, "70.00", base),
        reading(2, "66.20", base + timedelta(days=1)),
        reading(3, "61.20", base + timedelta(days=2)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("4.40")
    assert average.window_hours == Decimal("48")


def test_balance_drop_does_not_cross_provider_switch() -> None:
    base = datetime(2026, 8, 24, 8)
    readings = [
        reading(1, "70.00", base, provider="mcard"),
        reading(2, "66.20", base + timedelta(days=1), provider="mcard"),
        reading(3, "10.00", base + timedelta(days=2), provider="hwgl"),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.value is None
    assert average.source == "insufficient"


def test_latest_balance_uses_provider_time_for_backfilled_history() -> None:
    fetched_at = datetime(2026, 8, 28, 20)
    readings = [
        reading(
            2,
            "25.00",
            fetched_at,
            provider="hwgl",
            provider_updated_at=datetime(2026, 8, 27, 20),
        ),
        reading(
            1,
            "30.00",
            fetched_at + timedelta(seconds=1),
            provider="hwgl",
            provider_updated_at=datetime(2026, 8, 26, 20),
        ),
    ]

    stats = build_usage_stats(
        readings,
        alert_days=1,
        alert_threshold_mode="days",
        fixed_threshold=None,
        default_daily_usage_kwh=5,
    )

    assert stats.latest_balance == Decimal("25.00")
    assert stats.latest_provider_updated_at == datetime(2026, 8, 27, 20)


def test_balance_drop_after_long_vacancy_requires_new_samples() -> None:
    today = datetime.now().date()
    base = datetime.combine(today - timedelta(days=8), datetime.min.time()).replace(
        hour=8
    )
    readings = [
        reading(1, "70.00", base, provider="hwgl"),
        reading(2, "66.00", base + timedelta(days=1), provider="hwgl"),
        reading(3, "61.00", base + timedelta(days=2), provider="hwgl"),
        reading(4, "61.00", base + timedelta(days=3), provider="hwgl"),
        reading(5, "61.00", base + timedelta(days=4), provider="hwgl"),
        reading(6, "61.00", base + timedelta(days=5), provider="hwgl"),
        reading(7, "60.00", base + timedelta(days=6), provider="hwgl"),
    ]

    average = calculate_average_daily_usage(readings)
    stats = build_usage_stats(
        readings,
        alert_days=1,
        alert_threshold_mode="days",
        fixed_threshold=None,
        default_daily_usage_kwh=5,
    )

    assert average.value is None
    assert average.source == "insufficient"
    assert stats.average_daily_usage is None
    assert stats.estimated_daily_usage == Decimal("5.00")
    assert stats.estimated_daily_usage_source == "default"


def test_balance_drop_with_only_one_recovery_day_falls_back_to_default() -> None:
    today = datetime.now().date()
    base = datetime.combine(today - timedelta(days=5), datetime.min.time()).replace(
        hour=8
    )
    readings = [
        reading(1, "50.00", base, provider="hwgl"),
        reading(2, "50.00", base + timedelta(days=1), provider="hwgl"),
        reading(3, "50.00", base + timedelta(days=2), provider="hwgl"),
        reading(4, "49.00", base + timedelta(days=3), provider="hwgl"),
    ]

    average = calculate_average_daily_usage(readings)
    stats = build_usage_stats(
        readings,
        alert_days=1,
        alert_threshold_mode="days",
        fixed_threshold=None,
        default_daily_usage_kwh=5,
    )

    assert average.value is None
    assert average.source == "insufficient"
    assert stats.average_daily_usage is None
    assert stats.estimated_daily_usage == Decimal("5.00")
    assert stats.estimated_daily_usage_source == "default"


def test_balance_drop_restarts_after_balance_increase() -> None:
    base = datetime(2026, 8, 24, 8)
    readings = [
        reading(1, "100.00", base),
        reading(2, "90.00", base + timedelta(days=1)),
        reading(3, "150.00", base + timedelta(days=2)),
        reading(4, "146.00", base + timedelta(days=3)),
        reading(5, "140.00", base + timedelta(days=4)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("5")
    assert average.window_hours == Decimal("48")
    assert "余额上升后" in average.basis


def test_balance_drop_ignores_recharge_and_zero_delta() -> None:
    base = datetime(2026, 8, 24, 8)
    readings = [
        reading(1, "50.00", base),
        reading(2, "50.00", base + timedelta(days=1)),
        reading(3, "55.00", base + timedelta(days=2)),
        reading(4, "51.00", base + timedelta(days=3)),
        reading(5, "47.00", base + timedelta(days=4)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("4")
    assert average.sample_days == 2


def test_balance_drop_after_long_silence_needs_a_second_recovery_sample() -> None:
    base = datetime(2026, 8, 20, 8)
    readings = [
        reading(1, "50.00", base),
        reading(2, "50.00", base + timedelta(days=1)),
        reading(3, "50.00", base + timedelta(days=2)),
        reading(4, "50.00", base + timedelta(days=3)),
        reading(5, "49.00", base + timedelta(days=4)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.value is None
    assert average.source == "insufficient"

def test_s11_213_balance_average_starts_after_recharge_boundary() -> None:
    # This online s11-213 regression covers the balance-fallback path after
    # the 2026-09-01 recharge; it intentionally omits daily_usage and
    # provider_updated_at. The reported HWGL-day path is tested separately.
    base = datetime(2026, 9, 1, 14)
    readings = [
        reading(1, "9.76", base - timedelta(hours=3), provider="hwgl"),
        reading(2, "155.61", base, provider="hwgl"),
        reading(3, "151.56", base + timedelta(hours=12), provider="hwgl"),
        reading(4, "150.09", base + timedelta(hours=15), provider="hwgl"),
        reading(5, "148.98", base + timedelta(hours=24), provider="hwgl"),
        reading(6, "147.50", base + timedelta(hours=30), provider="hwgl"),
        reading(7, "144.10", base + timedelta(hours=36), provider="hwgl"),
        reading(8, "141.48", base + timedelta(hours=48), provider="hwgl"),
        reading(9, "139.21", base + timedelta(hours=54), provider="hwgl"),
        reading(10, "136.90", base + timedelta(hours=60), provider="hwgl"),
        reading(11, "134.20", base + timedelta(hours=72), provider="hwgl"),
        reading(12, "130.92", base + timedelta(hours=78), provider="hwgl"),
        reading(13, "126.24", base + timedelta(hours=84), provider="hwgl"),
        reading(14, "121.12", base + timedelta(hours=96), provider="hwgl"),
        reading(15, "117.44", base + timedelta(hours=100), provider="hwgl"),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("9.160799999999999999999999999")
    assert average.window_hours == Decimal("100")
    assert average.active_period_start == date(2026, 9, 1)
    assert average.active_period_end == date(2026, 9, 5)

def test_balance_drop_after_long_silence_uses_only_new_segment_window() -> None:
    base = datetime(2026, 8, 20, 8)
    readings = [
        reading(1, "100.00", base, provider="hwgl"),
        reading(2, "90.00", base + timedelta(days=1), provider="hwgl"),
        reading(3, "90.00", base + timedelta(days=4), provider="hwgl"),
        reading(4, "86.00", base + timedelta(days=5), provider="hwgl"),
        reading(5, "82.00", base + timedelta(days=6), provider="hwgl"),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "measured"
    assert average.value == Decimal("4")
    assert average.window_hours == Decimal("48")
    assert average.active_period_start == date(2026, 8, 24)
    assert average.active_period_end == date(2026, 8, 26)


def test_balance_drop_short_window_is_not_extrapolated() -> None:
    base = datetime(2026, 8, 28, 8)
    readings = [
        reading(1, "20.00", base),
        reading(2, "19.00", base + timedelta(hours=2)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.value is None
    assert average.source == "insufficient"
