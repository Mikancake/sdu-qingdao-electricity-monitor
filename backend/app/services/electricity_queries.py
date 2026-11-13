"""Token-aware orchestration around provider-specific electricity clients."""

from dataclasses import dataclass

from app.electricity.client import ElectricityQueryResult
from app.electricity.provider import provider_requires_token, query_electricity
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.services.token_health import record_reserved_token_health
from app.services.token_pool import reserve_available_token


@dataclass(frozen=True)
class ElectricityQueryExecution:
    result: ElectricityQueryResult
    auth_token_id: int | None = None


def execute_room_query(room: Room, *, source: str) -> ElectricityQueryExecution:
    """Execute one query and write token health only when mcard is selected."""
    requires_token = provider_requires_token(room)
    token = reserve_available_token() if requires_token else None
    if requires_token and token is None:
        return ElectricityQueryExecution(
            ElectricityQueryResult(
                success=False,
                provider="mcard",
                error_kind="token",
                error_msg="no enabled auth token",
            )
        )

    result = query_electricity(room, token_value=token.token_value if token is not None else None)
    if token is not None:
        record_reserved_token_health(
            token.id,
            success=result.success and result.balance is not None,
            source=source,
            error_kind=result.error_kind,
            error_msg=result.error_msg,
        )
    return ElectricityQueryExecution(result=result, auth_token_id=token.id if token is not None else None)


def apply_query_resolution(room: Room, result: ElectricityQueryResult) -> None:
    """Persist provider identifiers learned from a successful directory lookup."""
    if not result.success:
        return
    room.provider = result.provider
    if result.resolved_room_key:
        room.provider_room_key = result.resolved_room_key
    if result.resolved_line_id:
        room.provider_line_id = result.resolved_line_id
    if result.resolved_campus:
        room.provider_campus = result.resolved_campus
    if result.resolved_building:
        room.provider_building = result.resolved_building
    if result.resolved_floor:
        room.provider_floor = result.resolved_floor


def reading_from_query(room_id: int, result: ElectricityQueryResult, *, source: str) -> ElectricityReading:
    """Convert a successful provider result into a database reading."""
    if not result.success or result.balance is None:
        raise ValueError("cannot create a reading from an unsuccessful query")
    return ElectricityReading(
        room_id=room_id,
        balance=result.balance,
        source=source,
        provider=result.provider,
        provider_updated_at=result.provider_updated_at,
        reported_daily_usage=result.reported_daily_usage,
        reported_usage_date=result.reported_usage_date,
        power_status=result.power_status,
        free_electricity=result.free_electricity,
        paid_electricity=result.paid_electricity,
        arrears_electricity=result.arrears_electricity,
        electricity_price=result.electricity_price,
        estimated_amount=result.estimated_amount,
    )
