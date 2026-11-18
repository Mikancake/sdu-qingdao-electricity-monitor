from datetime import date
from decimal import Decimal
from hashlib import sha256

import requests
import pytest

from app.electricity.hwgl_client import HwglElectricityClient
from app.models.room import Room


class FakeResponse:
    def __init__(self, payload, status_code: int = 200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class FakeHttpClient:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[tuple[str, dict]] = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def room(*, building_key: str = "fenghuang_11", number: str = "TEST-901") -> Room:
    return Room(
        id=1,
        campus="青岛校区",
        campus_param="青岛校区&青岛校区",
        building_key=building_key,
        building_name="凤凰居11公寓",
        building_param="hwgl&凤凰居11公寓",
        room_number=number,
        provider="hwgl",
        provider_campus="山东大学青岛校区",
        provider_building="凤凰居11公寓",
    )


def directory_payload(*, duplicate: bool = False):
    rows = [
        {
            "xiaoqu": "山东大学青岛校区",
            "lhao": "凤凰居11公寓",
            "cenghao": "2",
            "fhao": "901",
            "fjhao": "fake-room-key",
            "xl": 10,
        }
    ]
    if duplicate:
        rows.append({**rows[0], "fjhao": "another-room-key", "xl": 20})
    return {"returncode": "0", "data": rows, "message": "ok"}


def reading_payload(*, records=None, returncode="0"):
    return {
        "returncode": returncode,
        "message": "ok",
        "data": {"records": records or [], "pageNumber": 1, "pageSize": 10, "totalRow": len(records or [])},
    }


def test_hwgl_resolves_room_and_uses_official_balance_formula() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(
            reading_payload(
                records=[
                    {
                        "payele": "1.2500",
                        "freeele": "20.7500",
                        "lossele": "0.5000",
                        "sumele": "999.0000",
                        "dayele": "4.4000",
                        "dbday": "2026-08-28",
                        "sjdylday": "2026-08-27 00:00:00",
                        "updatetime": "2026-08-28 16:00:11",
                        "dbstatech": "正常供电",
                    }
                ]
            )
        ),
    )
    client = HwglElectricityClient(
        http_client=http,
        base_url="http://example.invalid/api",
        timeout=2,
        directory_cache_seconds=0,
    )

    result = client.query_room(room(), query_date=date(2026, 8, 28))

    assert result.success is True
    assert result.balance == Decimal("21.5000")
    assert result.reported_daily_usage == Decimal("4.4000")
    assert result.reported_usage_date == date(2026, 8, 27)
    assert result.provider_updated_at is not None and result.provider_updated_at.utcoffset() is not None
    assert result.resolved_room_key == "fake-room-key"
    assert result.resolved_line_id == "10"
    assert result.power_status == "正常供电"
    query_body = http.calls[1][1]["json"]
    assert query_body["condition"][0]["value"] == "fake-room-key"
    assert query_body["condition"][1]["value"] == 10


def test_hwgl_falls_back_to_previous_date_and_accepts_numeric_returncode() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(reading_payload(records=[], returncode=0)),
        FakeResponse(reading_payload(records=[{"payele": "0", "freeele": "8", "lossele": "0"}], returncode=0)),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    result = client.query_room(room(), query_date=date(2026, 8, 28))

    assert result.success is True
    assert result.balance == Decimal("8")
    assert http.calls[1][1]["json"]["condition"][2]["value"] == "2026-08-28"
    assert http.calls[2][1]["json"]["condition"][2]["value"] == "2026-08-27"


def test_hwgl_exact_date_query_does_not_substitute_previous_day() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(reading_payload(records=[])),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    result = client.query_room_for_date(room(), date(2026, 8, 28))

    assert result.success is False
    assert result.error_kind == "no_reading"
    assert len(http.calls) == 2
    assert http.calls[1][1]["json"]["condition"][2]["value"] == "2026-08-28"


def test_hwgl_reports_ambiguous_room_without_querying_balance() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(FakeResponse(directory_payload(duplicate=True)))
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    result = client.query_room(room(), query_date=date(2026, 8, 28))

    assert result.success is False
    assert result.error_kind == "room_ambiguous"
    assert len(http.calls) == 1


def test_hwgl_classifies_timeout() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(requests.Timeout("slow"))
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    result = client.query_room(room())

    assert result.success is False
    assert result.error_kind == "timeout"


@pytest.mark.parametrize(
    ("response", "expected_kind"),
    [
        (FakeResponse({}, status_code=503), "http"),
        (FakeResponse({"returncode": "9", "message": "upstream failed"}), "api"),
        (FakeResponse(ValueError("not json")), "parse"),
    ],
)
def test_hwgl_classifies_directory_failures(response, expected_kind: str) -> None:
    HwglElectricityClient.clear_directory_cache()
    client = HwglElectricityClient(
        http_client=FakeHttpClient(response),
        base_url="http://example.invalid",
        directory_cache_seconds=0,
    )

    result = client.query_room(room())

    assert result.success is False
    assert result.error_kind == expected_kind


def test_hwgl_reports_missing_room_after_refreshing_directory() -> None:
    HwglElectricityClient.clear_directory_cache()
    other_room_directory = directory_payload()
    other_room_directory["data"][0]["fhao"] = "902"
    client = HwglElectricityClient(
        http_client=FakeHttpClient(FakeResponse(other_room_directory), FakeResponse(other_room_directory)),
        base_url="http://example.invalid",
        directory_cache_seconds=0,
    )

    result = client.query_room(room())

    assert result.success is False
    assert result.error_kind == "room_not_found"


def test_hwgl_reports_no_reading_after_today_and_yesterday_are_empty() -> None:
    HwglElectricityClient.clear_directory_cache()
    client = HwglElectricityClient(
        http_client=FakeHttpClient(
            FakeResponse(directory_payload()),
            FakeResponse(reading_payload(records=[])),
            FakeResponse(reading_payload(records=[])),
        ),
        base_url="http://example.invalid",
        directory_cache_seconds=0,
    )

    result = client.query_room(room(), query_date=date(2026, 8, 28))

    assert result.success is False
    assert result.error_kind == "no_reading"


def test_hwgl_query_daily_records_uses_usage_day_and_deduplicates_rows() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(
            reading_payload(
                records=[
                    {
                        "payele": "2",
                        "freeele": "8",
                        "lossele": "0",
                        "dayele": "4.10",
                        "sjdylday": "2026-08-27 00:00:00",
                        "updatetime": "2026-08-28 08:00:00",
                        "dbstatech": "正常供电",
                    },
                    {
                        "payele": "2.5",
                        "freeele": "8",
                        "lossele": "0",
                        "dayele": "4.25",
                        "sjdylday": "2026-08-27 00:00:00",
                        "updatetime": "2026-08-28 16:00:00",
                        "dbstatech": "正常供电",
                    },
                ]
            )
        ),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    results = client.query_daily_records(room(), date(2026, 8, 27), date(2026, 8, 28))

    assert len(results) == 1
    assert results[0].reported_usage_date == date(2026, 8, 27)
    assert results[0].balance == Decimal("10.5")
    assert results[0].reported_daily_usage == Decimal("4.25")
    condition = http.calls[1][1]["json"]["condition"]
    assert condition[2] == {"field": "sjdylday", "operation": "gte", "value": "2026-08-27"}
    assert condition[3] == {"field": "sjdylday", "operation": "lte", "value": "2026-08-28"}


def test_hwgl_query_daily_records_falls_back_to_settlement_day() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(reading_payload(records=[])),
        FakeResponse(
            reading_payload(
                records=[
                    {
                        "payele": "1",
                        "freeele": "9",
                        "lossele": "0",
                        "dayele": "3.50",
                        "dbday": "2026-08-28",
                        "updatetime": "2026-08-28 12:00:00",
                    }
                ]
            )
        ),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    results = client.query_daily_records(room(), date(2026, 8, 28), date(2026, 8, 28))

    assert len(results) == 1
    assert results[0].reported_usage_date == date(2026, 8, 28)
    assert http.calls[1][1]["json"]["condition"][2]["field"] == "sjdylday"
    assert http.calls[2][1]["json"]["condition"][2]["field"] == "dbday"


def test_hwgl_query_recharges_hashes_order_id_and_parses_fields() -> None:
    HwglElectricityClient.clear_directory_cache()
    order_id = "ORDER-20260828-123456789"
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(
            {
                "returncode": "0",
                "data": {
                    "records": [
                        {
                            "oderid": order_id,
                            "paytime": "2026-08-28 09:10:11",
                            "payfee": "30.50",
                            "linetype": "照明",
                            "paymentstatus": "已支付",
                            "processingstatus": "已入账",
                        }
                    ]
                },
            }
        ),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    records = client.query_recharges(room(), page_size=20)

    assert len(records) == 1
    assert records[0].external_id_hash == sha256(order_id.encode()).hexdigest()
    assert records[0].external_id_tail == order_id[-6:]
    assert records[0].paid_at is not None
    assert records[0].amount == Decimal("30.50")
    assert records[0].line_type == "照明"
    assert records[0].payment_status == "已支付"
    assert records[0].processing_status == "已入账"
    assert order_id not in records[0].external_id_hash
    assert http.calls[1][0].endswith("/weixinDbCharges/search")
    assert http.calls[1][1]["json"]["pageSize"] == 20


def test_hwgl_query_recharges_falls_back_to_dbnumber() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse({"returncode": "0", "data": {"records": []}}),
        FakeResponse({"returncode": "0", "data": {"records": []}}),
        FakeResponse(
            {
                "returncode": "0",
                "data": {"records": [{"orderid": "fallback-1", "amount": "5"}]},
            }
        ),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    records = client.query_recharges(room())

    assert len(records) == 1
    assert http.calls[1][1]["json"]["condition"][-2]["field"] == "openid"
    assert http.calls[1][1]["json"]["condition"][-1]["field"] == "dbnumber"
    assert http.calls[2][1]["json"]["condition"][-1]["field"] == "openid"
    assert http.calls[3][1]["json"]["condition"][-1]["field"] == "dbnumber"


def test_hwgl_query_price_parses_current_electricity_price() -> None:
    HwglElectricityClient.clear_directory_cache()
    http = FakeHttpClient(
        FakeResponse(directory_payload()),
        FakeResponse(
            {
                "returncode": 0,
                "data": {"records": [{"price": "0.52", "updatetime": "2026-08-28 10:00:00"}]},
            }
        ),
    )
    client = HwglElectricityClient(http_client=http, base_url="http://example.invalid", directory_cache_seconds=0)

    price = client.query_price(room())

    assert price is not None
    assert price.price == Decimal("0.52")
    assert price.fetched_at.tzinfo is not None
    assert http.calls[1][0].endswith("/electricityPrice/search")


@pytest.mark.parametrize("value", [None, "", "NaN", "Infinity"])
def test_hwgl_invalid_balance_is_not_a_successful_reading(value) -> None:
    target = room()
    target.provider_room_key = "test-key"
    target.provider_line_id = "10"
    http = FakeHttpClient(FakeResponse(reading_payload(records=[{"payele": value}])))
    result = HwglElectricityClient(http_client=http).query_room_for_date(target, date(2026, 8, 28))
    assert not result.success and result.balance is None
    assert result.error_kind == "parse"
