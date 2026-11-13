from decimal import Decimal
from types import SimpleNamespace

from app.electricity.client import ElectricityQueryResult
from app.electricity.provider import provider_requires_token, query_electricity
from app.models.room import Room
from app.services import electricity_queries


def make_room(provider: str) -> Room:
    return Room(
        id=1,
        campus="青岛校区",
        campus_param="青岛校区&青岛校区",
        building_key="fenghuang_11" if provider == "hwgl" else "fenghuang_1",
        building_name="测试楼",
        building_param="test&测试楼",
        room_number="101",
        provider=provider,
    )


class FakeHwglClient:
    def query_room(self, room):
        return ElectricityQueryResult(True, balance=Decimal("12.34"), provider="hwgl")


def test_hwgl_provider_does_not_require_a_token() -> None:
    target = make_room("hwgl")
    assert provider_requires_token(target) is False
    result = query_electricity(target, hwgl_client=FakeHwglClient())
    assert result.success is True
    assert result.provider == "hwgl"


def test_query_service_never_reserves_token_for_hwgl(monkeypatch) -> None:
    target = make_room("hwgl")
    monkeypatch.setattr(electricity_queries, "provider_requires_token", lambda room: False)
    monkeypatch.setattr(
        electricity_queries,
        "reserve_available_token",
        lambda: (_ for _ in ()).throw(AssertionError("HWGL must not reserve a token")),
    )
    monkeypatch.setattr(
        electricity_queries,
        "query_electricity",
        lambda room, token_value=None: ElectricityQueryResult(True, balance=Decimal("7.50"), provider="hwgl"),
    )

    execution = electricity_queries.execute_room_query(target, source="test")

    assert execution.result.success is True
    assert execution.auth_token_id is None


def test_query_service_records_health_only_for_mcard(monkeypatch) -> None:
    target = make_room("mcard")
    health_calls = []
    monkeypatch.setattr(electricity_queries, "provider_requires_token", lambda room: True)
    monkeypatch.setattr(
        electricity_queries,
        "reserve_available_token",
        lambda: SimpleNamespace(id=9, token_value="fake-token"),
    )
    monkeypatch.setattr(
        electricity_queries,
        "query_electricity",
        lambda room, token_value=None: ElectricityQueryResult(True, balance=Decimal("7.50"), provider="mcard"),
    )
    monkeypatch.setattr(electricity_queries, "record_reserved_token_health", lambda *args, **kwargs: health_calls.append((args, kwargs)))

    execution = electricity_queries.execute_room_query(target, source="test")

    assert execution.auth_token_id == 9
    assert health_calls and health_calls[0][0] == (9,)
