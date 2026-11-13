"""Provider selection shared by API requests and the scheduled worker."""

from __future__ import annotations

from app.electricity.buildings import get_building
from app.electricity.client import CampusElectricityClient, ElectricityQueryResult, PostClient
from app.electricity.hwgl_client import HwglElectricityClient
from app.models.room import Room


MCARD_PROVIDER = "mcard"
HWGL_PROVIDER = "hwgl"
KNOWN_PROVIDERS = {MCARD_PROVIDER, HWGL_PROVIDER}


def room_provider(room: Room) -> str:
    if room.provider in KNOWN_PROVIDERS:
        return room.provider
    building = get_building(room.building_key)
    return building.provider if building is not None else MCARD_PROVIDER


def provider_requires_token(room: Room) -> bool:
    return room_provider(room) == MCARD_PROVIDER


def query_electricity(
    room: Room,
    *,
    token_value: str | None = None,
    hwgl_client: HwglElectricityClient | None = None,
    mcard_http_client: PostClient | None = None,
) -> ElectricityQueryResult:
    provider = room_provider(room)
    if provider == HWGL_PROVIDER:
        return (hwgl_client or HwglElectricityClient()).query_room(room)
    if token_value is None:
        return ElectricityQueryResult(
            success=False,
            provider=MCARD_PROVIDER,
            error_kind="token",
            error_msg="no enabled auth token",
        )
    return CampusElectricityClient(token_value, http_client=mcard_http_client).query_room(room)
