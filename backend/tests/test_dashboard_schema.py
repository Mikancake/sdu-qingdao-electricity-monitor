from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.schemas.reading import RecentReadingOut


def test_recent_reading_schema_accepts_sqlalchemy_style_attributes() -> None:
    reading = SimpleNamespace(
        id=7,
        balance=Decimal("12.34"),
        provider="hwgl",
        provider_updated_at=datetime(2026, 8, 28, 12, 0),
        reported_daily_usage=Decimal("4.3650"),
        reported_usage_date=date(2026, 8, 27),
        power_status="正常供电",
        free_electricity=Decimal("1.00"),
        paid_electricity=Decimal("11.34"),
        arrears_electricity=Decimal("0.00"),
        electricity_price=Decimal("0.5200"),
        estimated_amount=Decimal("5.90"),
        read_at=datetime(2026, 8, 28, 12, 0),
    )

    result = RecentReadingOut.model_validate(reading)

    assert result.id == 7
    assert result.balance == Decimal("12.34")
    assert result.reported_daily_usage == Decimal("4.3650")
