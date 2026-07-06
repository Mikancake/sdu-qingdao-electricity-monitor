from typing import Any

from app.electricity.buildings import DEFAULT_CAMPUS, DEFAULT_CAMPUS_PARAM, display_name_from_param, get_building


class RoomInputError(ValueError):
    pass


def normalize_room_data(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)
    building_key = (normalized.get("building_key") or "").strip() or None
    building = get_building(building_key)

    building_param = (normalized.get("building_param") or "").strip()
    building_name = (normalized.get("building_name") or "").strip()
    room_number = str(normalized.get("room_number") or "").strip()

    if building is not None:
        building_param = building_param or building.param
        building_name = building_name or building.name
    if not building_name and building_param:
        building_name = display_name_from_param(building_param) or ""

    if not building_param:
        raise RoomInputError("missing building_param or known building_key")
    if not building_name:
        raise RoomInputError("missing building_name")
    if not room_number:
        raise RoomInputError("missing room_number")

    return {
        "campus": (normalized.get("campus") or DEFAULT_CAMPUS).strip(),
        "campus_param": (normalized.get("campus_param") or DEFAULT_CAMPUS_PARAM).strip(),
        "building_key": building_key,
        "building_name": building_name,
        "building_param": building_param,
        "room_number": room_number,
    }
