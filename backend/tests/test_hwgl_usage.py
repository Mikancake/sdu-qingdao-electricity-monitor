from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.room import Room
from app.services import usage

from app.models.electricity_recharge import ElectricityRecharge
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

    assert average.source == "daily_settlement"
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


def test_balance_drop_combines_normal_intervals_on_both_sides_of_recharge() -> None:
    base = datetime(2026, 8, 24, 8)
    readings = [
        reading(1, "100.00", base),
        reading(2, "90.00", base + timedelta(days=1)),
        reading(3, "150.00", base + timedelta(days=2)),
        reading(4, "146.00", base + timedelta(days=3)),
        reading(5, "140.00", base + timedelta(days=4)),
    ]

    average = calculate_average_daily_usage(readings)

    assert average.source == "daily_settlement"
    assert average.value == Decimal(20) / 3
    assert average.window_hours == Decimal("72")


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

    assert average.source == "daily_settlement"
    # The flat interval before the credit has no confirmed settlement.
    assert average.value == Decimal(4)
    assert average.sample_days == 2


def test_repeated_credits_retain_measured_rate_and_update_remaining_balance() -> None:
    base = datetime(2026, 8, 24)
    points = [reading(i, balance, base + timedelta(days=i))
              for i, balance in enumerate(["30", "26", "20", "120", "180"])]
    stats = build_usage_stats(points, alert_days=2, alert_threshold_mode="days",
                              fixed_threshold=None, default_daily_usage_kwh=9)
    assert stats.estimated_daily_usage_source == "daily_settlement"
    assert stats.estimated_daily_usage == 5 and stats.usage_window_hours == 48
    assert stats.latest_balance == 180 and stats.days_remaining == 36 and stats.alert_threshold == 10


def test_daily_settlement_unchanged_by_repolls_and_combines_two_day_cycle() -> None:
    base = datetime(2026, 10, 1, 0)
    balances = ["50", "46", "46", "36"]
    def poll(hours):
        return [reading(day * 24 + h, balance, base + timedelta(days=day, hours=h))
                for day, balance in enumerate(balances) for h in hours]
    once = calculate_average_daily_usage(poll([0]))
    frequent = calculate_average_daily_usage(poll([0, 2, 4, 6, 8, 10]))
    assert once == frequent
    assert once.value == Decimal(14) / 3 and once.sample_days == 3


def test_same_day_debits_and_then_credit_keep_one_day_of_use() -> None:
    base = datetime(2026, 10, 1, 0)
    points = [reading(i, b, base + timedelta(hours=h)) for i, (h, b) in enumerate([
        (0, "30"), (24, "26"), (26, "25"), (32, "100"), (36, "99")])]
    result = calculate_average_daily_usage(points)
    assert result.value == 5 and result.sample_days == 1


def test_initial_midnight_crossing_or_long_gap_is_not_a_cycle() -> None:
    from datetime import timezone
    base = datetime(2026, 10, 1, 15, 50, tzinfo=timezone.utc)  # 23:50 Shanghai
    points = [reading(1, "30", base), reading(2, "25", base + timedelta(minutes=20))]
    assert calculate_average_daily_usage(points).value is None
    points.append(reading(3, "21", base + timedelta(days=1, minutes=20)))
    assert calculate_average_daily_usage(points).value == 4
    points.append(reading(4, "3", base + timedelta(days=5)))
    assert calculate_average_daily_usage(points).value is None


def test_mcard_timeline_not_truncated_by_chart_limit() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        room = Room(id=1, building_name="demo", building_param="demo", room_number="1", provider="mcard")
        db.add(room)
        base = datetime.now() - timedelta(days=3)
        db.add_all([reading(1, "20", base), reading(2, "15", base + timedelta(days=1))])
        db.add_all(reading(3+i, "15", base+timedelta(days=1, minutes=i+1)) for i in range(220))
        db.commit()
        stats, recent = usage.get_room_usage_stats(db, 1, days=5, limit=2, alert_days=1,
                                                  alert_threshold_mode="days", fixed_threshold=None)
        assert len(recent) == 2 and stats.average_daily_usage == 5
        assert stats.days_remaining == 3 and stats.average_daily_usage_sample_days == 1


def test_free_grant_hidden_by_larger_paid_balance_drop() -> None:
    base = datetime(2026, 8, 24)
    points = [reading(i, total, base + timedelta(days=i), provider="hwgl")
              for i, total in enumerate(["50", "46", "40", "39"])]
    for item, free in zip(points, [0, 0, 0, 8]):
        item.free_electricity = Decimal(free)
    assert calculate_average_daily_usage(points).value == 5


def test_only_posted_room_orders_exclude_their_own_interval() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    base = datetime.now().replace(microsecond=0) - timedelta(days=4)
    with Session(engine) as db:
        db.add(Room(id=1, building_name="demo", building_param="demo", room_number="1", provider="hwgl"))
        db.add_all(reading(i+1, total, base+timedelta(days=i), provider="hwgl")
                   for i, total in enumerate(["30", "26", "20", "19", "15"]))
        for day, status in [(1, "待入账"), (3, "已入账")]:
            db.add(ElectricityRecharge(room_id=1, provider="hwgl", external_id_hash=str(day),
                                       processing_status=status, paid_at=base+timedelta(days=day)))
        db.commit()
        stats, _ = usage.get_room_usage_stats(db, 1, days=6, alert_days=1, alert_threshold_mode="days", fixed_threshold=None)
        # Ignore 20 -> 19, not 30 -> 26 or the interval starting at the posted time.
        assert stats.average_daily_usage == Decimal("4.67") and stats.usage_window_hours == 72


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

def test_credit_interval_before_first_observable_drop_adds_no_time() -> None:
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


def test_limited_stats_select_newest_points_then_return_chronological(monkeypatch) -> None:
    base = datetime(2026, 8, 24, 12)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return base + timedelta(days=3)

    monkeypatch.setattr(usage, "datetime", Clock)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        room = Room(id=1, building_name="test", building_param="test", room_number="101", provider="hwgl", provider_price=2)
        db.add(room)
        db.flush()
        newest = reading(3, "1", base, provider="hwgl", provider_updated_at=base + timedelta(days=2))
        newest.electricity_price = Decimal("0.00")
        db.add_all([
            reading(1, "40", base + timedelta(days=2), provider="hwgl", provider_updated_at=base),
            reading(2, "30", base, provider="hwgl", provider_updated_at=base + timedelta(days=1)),
            newest,
        ])
        db.commit()
        stats, points = usage.get_room_usage_stats(db, room.id, days=4, limit=2, alert_days=1,
                                                  alert_threshold_mode="fixed", fixed_threshold=Decimal("2"))
        assert [point.id for point in points] == [2, 3]
        assert stats.latest_balance == Decimal("1.00") and stats.is_low_power
        assert stats.electricity_price == stats.estimated_amount == Decimal("0.00")


def test_arrears_keep_negative_balance_but_no_remaining_days() -> None:
    stats = build_usage_stats(
        [reading(1, "-1.00", datetime(2026, 8, 24, 12))], alert_days=1,
        alert_threshold_mode="days", fixed_threshold=None, default_daily_usage_kwh=3,
    )
    assert stats.latest_balance == Decimal("-1.00")
    assert stats.days_remaining == Decimal("0.00")
    assert stats.is_low_power and stats.status == "low"
