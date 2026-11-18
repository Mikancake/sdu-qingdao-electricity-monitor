"""Read-only adapter for the HWGL dormitory electricity service."""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

import requests

from app.core.config import settings
from app.electricity.buildings import get_building
from app.electricity.client import ElectricityQueryResult, PostClient
from app.models.room import Room


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


class HwglClientError(RuntimeError):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


@dataclass(frozen=True)
class HwglRoomRecord:
    campus: str
    building: str
    floor: str | None
    display_room_number: str
    room_key: str
    line_id: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "HwglRoomRecord":
        campus = _text(payload.get("xiaoqu"))
        building = _text(payload.get("lhao"))
        display_room_number = _text(payload.get("fhao"))
        room_key = _text(payload.get("fjhao"))
        line_id = _text(payload.get("xl"))
        if not all((campus, building, display_room_number, room_key, line_id)):
            raise HwglClientError("parse", "宿舍目录包含不完整记录")
        return cls(
            campus=campus,
            building=building,
            floor=_text(payload.get("cenghao")) or None,
            display_room_number=display_room_number,
            room_key=room_key,
            line_id=line_id,
        )


@dataclass(frozen=True)
class HwglRechargeRecord:
    """Normalized recharge data; the raw upstream order id is never retained."""

    external_id_hash: str
    external_id_tail: str | None
    paid_at: datetime | None
    amount: Decimal | None
    line_type: str | None
    payment_status: str | None
    processing_status: str | None


@dataclass(frozen=True)
class HwglPriceRecord:
    price: Decimal
    fetched_at: datetime


class HwglElectricityClient:
    """Resolve public room labels to meter identifiers and query the latest reading."""

    provider = "hwgl"
    _directory_cache: dict[str, tuple[float, tuple[HwglRoomRecord, ...]]] = {}
    _directory_lock = threading.Lock()

    def __init__(
        self,
        *,
        http_client: PostClient | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
        directory_cache_seconds: int | None = None,
    ) -> None:
        self.http_client = http_client or requests
        self.base_url = (base_url or settings.hwgl_api_base_url).rstrip("/")
        self.timeout = timeout if timeout is not None else settings.hwgl_api_timeout
        self.directory_cache_seconds = (
            directory_cache_seconds
            if directory_cache_seconds is not None
            else settings.hwgl_directory_cache_seconds
        )

    @classmethod
    def clear_directory_cache(cls) -> None:
        with cls._directory_lock:
            cls._directory_cache.clear()

    def _post_json(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self.http_client.post(
                f"{self.base_url}{path}",
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                json=body,
                timeout=self.timeout,
            )
        except requests.Timeout as exc:
            raise HwglClientError("timeout", f"{type(exc).__name__}: {exc}") from exc
        except requests.RequestException as exc:
            raise HwglClientError("network", f"{type(exc).__name__}: {exc}") from exc

        if response.status_code != 200:
            raise HwglClientError("http", f"HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise HwglClientError("parse", f"响应不是有效 JSON：{type(exc).__name__}") from exc
        if not isinstance(payload, dict):
            raise HwglClientError("parse", "接口响应不是对象")
        if str(payload.get("returncode")) != "0":
            message = _text(payload.get("message")) or "unknown API error"
            raise HwglClientError("api", f"API returncode={payload.get('returncode')}: {message}")
        return payload

    def list_rooms(self, *, force_refresh: bool = False) -> tuple[HwglRoomRecord, ...]:
        """Return the public meter directory, cached per API base URL."""
        now = time.monotonic()
        with self._directory_lock:
            cached = self._directory_cache.get(self.base_url)
            if not force_refresh and cached is not None and cached[0] > now:
                return cached[1]

            payload = self._post_json(
                "/electricityMeter/searchnp",
                {
                    "fields": [],
                    "pageNo": 0,
                    "pageSize": 1000,
                    "orderBy": "",
                    "condition": [{"field": "flbs", "operation": "eq", "value": "00"}],
                    "subCondition": {},
                },
            )
            raw_rows = payload.get("data")
            if not isinstance(raw_rows, list):
                raise HwglClientError("parse", "宿舍目录 data 字段不是数组")
            parsed_records: list[HwglRoomRecord] = []
            for row in raw_rows:
                if not isinstance(row, dict):
                    continue
                try:
                    parsed_records.append(HwglRoomRecord.from_payload(row))
                except HwglClientError:
                    continue
            records = tuple(parsed_records)
            if not records:
                raise HwglClientError("parse", "宿舍目录为空")
            expires_at = now + max(0, self.directory_cache_seconds)
            self._directory_cache[self.base_url] = (expires_at, records)
            return records

    def resolve_room(self, room: Room, *, force_directory: bool = False) -> HwglRoomRecord:
        """Resolve a platform room without exposing provider identifiers to clients."""
        if not force_directory and room.provider_room_key and room.provider_line_id:
            return HwglRoomRecord(
                campus=room.provider_campus or settings.hwgl_campus_name,
                building=room.provider_building or room.building_name,
                floor=room.provider_floor,
                display_room_number=room.room_number,
                room_key=room.provider_room_key,
                line_id=room.provider_line_id,
            )

        building = get_building(room.building_key)
        wanted_buildings = set(building.provider_buildings if building is not None else ())
        if room.provider_building:
            wanted_buildings = {room.provider_building}
        elif not wanted_buildings and room.building_name:
            wanted_buildings = {room.building_name}

        wanted_campus = room.provider_campus or settings.hwgl_campus_name
        room_aliases = _room_aliases(room.room_number)
        matches: list[HwglRoomRecord] = []
        for record in self.list_rooms(force_refresh=force_directory):
            if wanted_campus and record.campus != wanted_campus:
                continue
            if wanted_buildings and record.building not in wanted_buildings:
                continue
            if room_aliases.isdisjoint(_room_aliases(record.display_room_number)):
                continue
            matches.append(record)

        unique_matches = {
            (record.room_key, record.line_id): record
            for record in matches
        }
        if not unique_matches:
            if not force_directory:
                return self.resolve_room(room, force_directory=True)
            raise HwglClientError("room_not_found", "没有在新电费系统中找到这个宿舍")
        if len(unique_matches) > 1:
            raise HwglClientError("room_ambiguous", "宿舍号对应多条电表记录，请选择准确的宿舍楼")
        return next(iter(unique_matches.values()))

    def _query_latest_record(
        self,
        resolved: HwglRoomRecord,
        current_date: date,
    ) -> dict[str, Any] | None:
        for candidate_date in (current_date, current_date - timedelta(days=1)):
            if record := self._query_record_for_date(resolved, candidate_date):
                return record
        return None

    def _query_record_for_date(
        self,
        resolved: HwglRoomRecord,
        query_date: date,
    ) -> dict[str, Any] | None:
        payload = self._post_json(
            "/webZndbbDayDate/search",
            {
                "condition": [
                    {"field": "fangnumer", "operation": "eq", "value": resolved.room_key},
                    {"field": "xl", "operation": "eq", "value": _line_value(resolved.line_id)},
                    {"field": "dbday", "operation": "eq", "value": query_date.isoformat()},
                    {"field": "xiaoqu", "operation": "eq", "value": resolved.campus},
                ]
            },
        )
        rows = _query_records(payload)
        return max(rows, key=lambda item: _text(item.get("updatetime"))) if rows else None

    def query_daily_records(
        self,
        room: Room,
        start_date: date,
        end_date: date,
    ) -> list[ElectricityQueryResult]:
        """Query a date range in one request and return normalized daily records."""
        if end_date < start_date:
            return []
        resolved = self.resolve_room(room)
        rows = self._query_daily_rows(resolved, start_date, end_date, date_field="sjdylday")
        # Deployments of the HWGL service have used both ``sjdylday`` (the
        # actual usage day) and ``dbday`` (the settlement/query day) as the
        # range field.  Prefer the usage-day query, then retry with the
        # compatible field only when it returned no rows.
        if not rows:
            rows = self._query_daily_rows(resolved, start_date, end_date, date_field="dbday")
        latest_by_date: dict[date, dict[str, Any]] = {}
        for row in rows:
            row_date = _parse_date(row.get("sjdylday")) or _parse_date(row.get("dbday"))
            if row_date is None or not start_date <= row_date <= end_date:
                continue
            existing = latest_by_date.get(row_date)
            if existing is None or _text(row.get("updatetime")) > _text(existing.get("updatetime")):
                latest_by_date[row_date] = row
        return [self._result_from_record(resolved, latest_by_date[key]) for key in sorted(latest_by_date)]

    def _query_daily_rows(
        self,
        resolved: HwglRoomRecord,
        start_date: date,
        end_date: date,
        *,
        date_field: str,
    ) -> list[dict[str, Any]]:
        payload = self._post_json(
            "/webZndbbDayDate/search",
            {
                "fields": [],
                "pageNo": 1,
                "pageSize": min(1000, max(1, (end_date - start_date).days + 1)),
                "orderBy": f"{date_field} desc",
                "condition": [
                    {"field": "fangnumer", "operation": "eq", "value": resolved.room_key},
                    {"field": "xl", "operation": "eq", "value": _line_value(resolved.line_id)},
                    {"field": date_field, "operation": "gte", "value": start_date.isoformat()},
                    {"field": date_field, "operation": "lte", "value": end_date.isoformat()},
                    {"field": "xiaoqu", "operation": "eq", "value": resolved.campus},
                ],
                "subCondition": {},
            },
        )
        return _query_records(payload)

    def query_recharges(
        self,
        room: Room,
        *,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        page_size: int = 1000,
    ) -> list[HwglRechargeRecord]:
        """Read the recharge history used by the HWGL web page."""
        resolved = self.resolve_room(room)
        base_conditions: list[dict[str, Any]] = [
            {"field": "paytype", "operation": "eq", "value": settings.hwgl_pay_type},
            {"field": "campusname", "operation": "eq", "value": resolved.campus},
        ]
        rows: list[dict[str, Any]] = []
        # The public page has shipped with either ``openid`` or ``dbnumber``
        # as the meter key.  Try the combined form first, then the individual
        # forms, while always retaining the campus and payment-type filters.
        identifier_variants = [
            ("openid", "dbnumber"),
            ("openid",),
            ("dbnumber",),
        ]
        for identifiers in identifier_variants:
            conditions = [*base_conditions]
            conditions.extend({"field": field, "operation": "eq", "value": resolved.room_key} for field in identifiers)
            if start_at is not None:
                conditions.append({"field": "createtime", "operation": "gte", "value": _format_datetime(start_at)})
            if end_at is not None:
                conditions.append({"field": "createtime", "operation": "lte", "value": _format_datetime(end_at)})
            payload = self._post_json(
                "/weixinDbCharges/search",
                {
                    "fields": [],
                    "pageNo": 1,
                    "pageSize": max(1, min(1000, page_size)),
                    "orderBy": "createtime desc",
                    "condition": conditions,
                    "subCondition": {},
                },
            )
            rows = _query_records(payload)
            if rows:
                break
        records: list[HwglRechargeRecord] = []
        for row in rows:
            identifier = _first_text(row, "oderid", "orderid", "orderId", "id")
            fingerprint_source = identifier or json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
            digest = hashlib.sha256(fingerprint_source.encode("utf-8")).hexdigest()
            records.append(
                HwglRechargeRecord(
                    external_id_hash=digest,
                    external_id_tail=_safe_tail(identifier),
                    paid_at=_parse_datetime(_first_value(row, "paytime", "createtime", "payTime")),
                    amount=_optional_decimal(_first_value(row, "payfee", "fee", "amount", "money")),
                    line_type=_first_text(row, "linetype", "lineType", "xlname"),
                    payment_status=_first_text(row, "paymentstatus", "paymentStatus", "paystatus"),
                    processing_status=_first_text(row, "processingstatus", "processingStatus", "status"),
                )
            )
        return records

    def query_price(self, room: Room) -> HwglPriceRecord | None:
        """Read the current electricity price for a resolved meter."""
        resolved = self.resolve_room(room)
        payload = self._post_json(
            "/electricityPrice/search",
            {
                "fields": [],
                "pageNo": 1,
                "pageSize": 1,
                "orderBy": "",
                "condition": [
                    {"field": "xiaoqu", "operation": "eq", "value": resolved.campus},
                    {"field": "fangnumer", "operation": "eq", "value": resolved.room_key},
                    {"field": "xl", "operation": "eq", "value": _line_value(resolved.line_id)},
                ],
                "subCondition": {},
            },
        )
        rows = _query_records(payload)
        if not rows:
            return None
        price = _optional_decimal(_first_value(rows[0], "price", "electricityprice", "dj"))
        if price is None or price < 0:
            raise HwglClientError("parse", "电价记录缺少有效 price 字段")
        return HwglPriceRecord(price=price, fetched_at=datetime.now(timezone.utc))

    def _result_from_record(
        self,
        resolved: HwglRoomRecord,
        record: dict[str, Any],
    ) -> ElectricityQueryResult:
        return ElectricityQueryResult(
            success=True,
            balance=_balance_from_record(record),
            provider=self.provider,
            provider_updated_at=_parse_datetime(record.get("updatetime")),
            reported_daily_usage=_optional_decimal(record.get("dayele")),
            reported_usage_date=_parse_date(record.get("sjdylday")) or _parse_date(record.get("dbday")),
            power_status=_text(record.get("dbstatech")) or None,
            free_electricity=_optional_decimal(record.get("freeele")),
            paid_electricity=_optional_decimal(record.get("payele")),
            arrears_electricity=_optional_decimal(record.get("lossele")),
            resolved_room_key=resolved.room_key,
            resolved_line_id=resolved.line_id,
            resolved_campus=resolved.campus,
            resolved_building=resolved.building,
            resolved_floor=resolved.floor,
        )

    def query_room_for_date(self, room: Room, query_date: date) -> ElectricityQueryResult:
        """Query one exact HWGL date without silently substituting the previous day."""
        try:
            resolved = self.resolve_room(room)
            record = self._query_record_for_date(resolved, query_date)
            if record is None:
                raise HwglClientError("no_reading", f"新电费系统没有返回 {query_date.isoformat()} 的读数")
            return self._result_from_record(resolved, record)
        except HwglClientError as exc:
            return ElectricityQueryResult(
                success=False,
                provider=self.provider,
                error_kind=exc.kind,
                error_msg=exc.message,
            )
        except (InvalidOperation, ValueError, TypeError) as exc:
            return ElectricityQueryResult(
                success=False,
                provider=self.provider,
                error_kind="parse",
                error_msg=f"{type(exc).__name__}: {exc}",
            )

    def query_room(self, room: Room, *, query_date: date | None = None) -> ElectricityQueryResult:
        """Query today, then yesterday, using China local dates rather than UTC."""
        try:
            resolved = self.resolve_room(room)
            current_date = query_date or datetime.now(SHANGHAI_TZ).date()
            record = self._query_latest_record(resolved, current_date)
            if record is None and room.provider_room_key and room.provider_line_id:
                refreshed = self.resolve_room(room, force_directory=True)
                if (refreshed.room_key, refreshed.line_id) != (resolved.room_key, resolved.line_id):
                    resolved = refreshed
                    record = self._query_latest_record(resolved, current_date)
            if record is None:
                raise HwglClientError("no_reading", "宿舍存在，但新电费系统暂时没有返回当日读数")

            return self._result_from_record(resolved, record)
        except HwglClientError as exc:
            return ElectricityQueryResult(
                success=False,
                provider=self.provider,
                error_kind=exc.kind,
                error_msg=exc.message,
            )
        except (InvalidOperation, ValueError, TypeError) as exc:
            return ElectricityQueryResult(
                success=False,
                provider=self.provider,
                error_kind="parse",
                error_msg=f"{type(exc).__name__}: {exc}",
            )


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _room_aliases(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKC", _text(value)).casefold().replace(" ", "")
    aliases = {normalized} if normalized else set()
    trailing_number = re.search(r"(\d+)$", normalized)
    if trailing_number:
        aliases.add(trailing_number.group(1).lstrip("0") or "0")
    return aliases


def _line_value(value: str) -> int | str:
    return int(value) if value.isdigit() else value


def _query_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    if isinstance(data, dict):
        records = data.get("records")
    else:
        records = data
    if records is None:
        return []
    if not isinstance(records, list):
        raise HwglClientError("parse", "电量查询 records 字段不是数组")
    return [record for record in records if isinstance(record, dict)]


def _required_decimal(record: dict[str, Any], key: str) -> Decimal:
    return _optional_decimal(record.get(key)) or Decimal("0")


def _optional_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    number = Decimal(str(value))
    if not number.is_finite():
        raise HwglClientError("parse", "电量记录包含非有限数值")
    return number


def _balance_from_record(record: dict[str, Any]) -> Decimal:
    if not any(record.get(key) not in (None, "") for key in ("payele", "freeele", "lossele")):
        raise HwglClientError("parse", "电量记录缺少余额字段")
    return _required_decimal(record, "payele") + _required_decimal(record, "freeele") - _required_decimal(record, "lossele")


def _parse_date(value: Any) -> date | None:
    text_value = _text(value)
    if not text_value:
        return None
    return date.fromisoformat(text_value[:10])


def _parse_datetime(value: Any) -> datetime | None:
    text_value = _text(value)
    if not text_value:
        return None
    parsed = datetime.fromisoformat(text_value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=SHANGHAI_TZ)


def _first_value(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def _first_text(record: dict[str, Any], *keys: str) -> str | None:
    value = _first_value(record, *keys)
    return _text(value) or None


def _safe_tail(value: str | None) -> str | None:
    if not value:
        return None
    return value[-6:]


def _format_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=SHANGHAI_TZ)
    return value.astimezone(SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M:%S")
