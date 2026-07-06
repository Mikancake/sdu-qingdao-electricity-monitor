from dataclasses import dataclass


DEFAULT_CAMPUS = "\u9752\u5c9b\u6821\u533a"
DEFAULT_CAMPUS_PARAM = "\u9752\u5c9b\u6821\u533a&\u9752\u5c9b\u6821\u533a"


@dataclass(frozen=True)
class Building:
    key: str
    name: str
    param: str


BUILDINGS: tuple[Building, ...] = (
    Building("fenghuang_1", "\u51e4\u51f0\u5c451\u53f7\u697c", "1503975832&\u51e4\u51f0\u5c451\u53f7\u697c"),
    Building("fenghuang_2", "\u51e4\u51f0\u5c452\u53f7\u697c", "1503975890&\u51e4\u51f0\u5c452\u53f7\u697c"),
    Building("fenghuang_3", "\u51e4\u51f0\u5c453\u53f7\u697c", "1503975902&\u51e4\u51f0\u5c453\u53f7\u697c"),
    Building("fenghuang_4", "\u51e4\u51f0\u5c454\u53f7\u697c", "1503975950&\u51e4\u51f0\u5c454\u53f7\u697c"),
    Building("fenghuang_5", "\u51e4\u51f0\u5c455\u53f7\u697c", "1503975967&\u51e4\u51f0\u5c455\u53f7\u697c"),
    Building("fenghuang_6", "\u51e4\u51f0\u5c456\u53f7\u697c", "1503975980&\u51e4\u51f0\u5c456\u53f7\u697c"),
    Building("fenghuang_7", "\u51e4\u51f0\u5c457\u53f7\u697c", "1503975988&\u51e4\u51f0\u5c457\u53f7\u697c"),
    Building("fenghuang_8", "\u51e4\u51f0\u5c458\u53f7\u697c", "1503975995&\u51e4\u51f0\u5c458\u53f7\u697c"),
    Building("fenghuang_9", "\u51e4\u51f0\u5c459\u53f7\u697c", "1503976004&\u51e4\u51f0\u5c459\u53f7\u697c"),
    Building("fenghuang_10", "\u51e4\u51f0\u5c4510\u53f7\u697c", "1503976037&\u51e4\u51f0\u5c4510\u53f7\u697c"),
    Building("fenghuang_11_13", "\u51e4\u51f0\u5c4511/13\u53f7\u697c", "1599193777&\u51e4\u51f0\u5c4511/13\u53f7\u697c"),
    Building("yuehai_b1", "\u9605\u6d77\u5c45B1\u697c", "1661835249&\u9605\u6d77\u5c45B1\u697c"),
    Building("yuehai_b2", "\u9605\u6d77\u5c45B2\u697c", "1661835256&\u9605\u6d77\u5c45B2\u697c"),
    Building("yuehai_b5", "\u9605\u6d77\u5c45B5\u697c", "1661835273&\u9605\u6d77\u5c45B5\u697c"),
    Building("yuehai_b9", "\u9605\u6d77\u5c45B9\u697c", "1693031698&\u9605\u6d77\u5c45B9\u697c"),
    Building("yuehai_b10", "\u9605\u6d77\u5c45B10\u697c", "1693031710&\u9605\u6d77\u5c45B10\u697c"),
)

BUILDING_BY_KEY = {building.key: building for building in BUILDINGS}


def get_building(key: str | None) -> Building | None:
    if not key:
        return None
    return BUILDING_BY_KEY.get(key)


def display_name_from_param(param: str | None) -> str | None:
    if not param:
        return None
    if "&" in param:
        return param.split("&", 1)[1].strip()
    return param.strip() or None
