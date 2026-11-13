from typing import Any

from app.electricity.buildings import (
    DEFAULT_CAMPUS,
    DEFAULT_CAMPUS_PARAM,
    HWGL_CAMPUS,
    display_name_from_param,
    get_building,
    get_building_by_param,
)


class RoomInputError(ValueError):
    pass


def normalize_room_number(value: Any) -> str:
    """Canonical room number used as part of the room identity.

    Students type the room number the way the campus system shows it
    (``B523``), while the platform's own reports and older rows used
    lowercase (``b523``).  Room identity is
    ``(campus_param, building_param, room_number)``, so the case has to be
    canonicalised here, otherwise the same room is stored twice and ends up
    being queried and notified twice.
    """
    return str(value or "").strip().lower()


def normalize_room_data(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)
    building_key = (normalized.get("building_key") or "").strip() or None
    building = get_building(building_key)

    building_param = (normalized.get("building_param") or "").strip()
    building_name = (normalized.get("building_name") or "").strip()
    room_number = normalize_room_number(normalized.get("room_number"))

    # Accept old persisted/request values, but always normalize the logical
    # S11/S13 location to the single public ``凤凰居11/13号楼`` entry.
    building = building or get_building_by_param(building_param)
    if building is not None:
        building_key = building.key
        building_param = building.param
        building_name = building.name
    if not building_name and building_param:
        building_name = display_name_from_param(building_param) or ""

    if not building_param:
        raise RoomInputError("missing building_param or known building_key")
    if not building_name:
        raise RoomInputError("missing building_name")
    if not room_number:
        raise RoomInputError("missing room_number")

    provider = building.provider if building is not None else str(normalized.get("provider") or "mcard").strip()
    provider_building = normalized.get("provider_building")
    if building is not None and len(building.provider_buildings) == 1:
        provider_building = building.provider_buildings[0]

    return {
        "campus": (normalized.get("campus") or DEFAULT_CAMPUS).strip(),
        "campus_param": (normalized.get("campus_param") or DEFAULT_CAMPUS_PARAM).strip(),
        "building_key": building_key,
        "building_name": building_name,
        "building_param": building_param,
        "room_number": room_number,
        "provider": provider,
        "provider_room_key": normalized.get("provider_room_key"),
        "provider_line_id": normalized.get("provider_line_id"),
        "provider_campus": normalized.get("provider_campus") or (HWGL_CAMPUS if provider == "hwgl" else None),
        "provider_building": provider_building,
        "provider_floor": normalized.get("provider_floor"),
    }
