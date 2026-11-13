from app.electricity.buildings import (
    HWGL_MERGED_BUILDING_KEY,
    HWGL_MERGED_BUILDING_NAME,
    HWGL_MERGED_BUILDING_PARAM,
    get_building,
    get_building_by_param,
    selectable_buildings,
)
from app.services.rooms import normalize_room_data


def test_hwgl_building_is_one_public_selectable_entry() -> None:
    buildings = selectable_buildings()
    names = {building.name for building in buildings}

    assert HWGL_MERGED_BUILDING_NAME in names
    assert "凤凰居11公寓" not in names
    assert "凤凰居13公寓" not in names


def test_legacy_hwgl_values_normalize_to_the_merged_building() -> None:
    assert get_building("fenghuang_11").key == HWGL_MERGED_BUILDING_KEY
    assert get_building("fenghuang_13").key == HWGL_MERGED_BUILDING_KEY
    assert get_building_by_param("hwgl&凤凰居11公寓").key == HWGL_MERGED_BUILDING_KEY

    normalized = normalize_room_data({"building_key": "fenghuang_13", "room_number": "213"})

    assert normalized["building_key"] == HWGL_MERGED_BUILDING_KEY
    assert normalized["building_name"] == HWGL_MERGED_BUILDING_NAME
    assert normalized["building_param"] == HWGL_MERGED_BUILDING_PARAM
    assert normalized["provider"] == "hwgl"
