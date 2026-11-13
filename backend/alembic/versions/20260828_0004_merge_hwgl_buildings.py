"""Use one public building name for the HWGL S11/S13 meter group.

The upstream service exposes the two labels ``凤凰居11公寓`` and
``凤凰居13公寓``.  They are one logical building in this application, so
existing room rows are normalized to the old public label while retaining the
upstream label in ``provider_building`` for exact meter resolution.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

import sqlalchemy as sa
from alembic import op


revision = "20260828_0004"
down_revision = "20260828_0003"
branch_labels = None
depends_on = None


MERGED_KEY = "fenghuang_11_13"
MERGED_NAME = "凤凰居11/13号楼"
MERGED_PARAM = "hwgl&凤凰居11/13号楼"
HWGL_CAMPUS = "山东大学青岛校区"
HWGL_BUILDINGS = {"凤凰居11公寓", "凤凰居13公寓"}


def _building_from_room_number(room_number: object) -> str | None:
    match = re.search(r"(\d{3})$", str(room_number or "").strip())
    number = int(match.group(1)) if match else None
    if number is not None and (
        108 <= number <= 119
        or 201 <= number <= 219
        or 301 <= number <= 319
        or 401 <= number <= 419
    ):
        return "凤凰居11公寓"
    if number is not None and (
        220 <= number <= 242
        or 320 <= number <= 344
        or 420 <= number <= 445
        or 501 <= number <= 523
        or 601 <= number <= 618
    ):
        return "凤凰居13公寓"
    return None


def _provider_building(row: Mapping[str, object]) -> str | None:
    current = str(row.get("provider_building") or "").strip()
    if current in HWGL_BUILDINGS:
        return current
    key = str(row.get("building_key") or "")
    if key == "fenghuang_11":
        return "凤凰居11公寓"
    if key == "fenghuang_13":
        return "凤凰居13公寓"
    return _building_from_room_number(row.get("room_number"))


def upgrade() -> None:
    connection = op.get_bind()
    rows = list(
        connection.execute(
            sa.text(
                """
                SELECT id, room_number, building_key, building_param, provider_building
                FROM rooms
                WHERE building_key IN ('fenghuang_11', 'fenghuang_13', 'fenghuang_11_13')
                   OR building_param IN (
                       'hwgl&凤凰居11公寓',
                       'hwgl&凤凰居13公寓',
                       'hwgl&凤凰居11/13号楼',
                       '1599193777&凤凰居11/13号楼'
                   )
                """
            )
        ).mappings()
    )
    for row in rows:
        connection.execute(
            sa.text(
                """
                UPDATE rooms
                SET provider = 'hwgl',
                    building_key = :building_key,
                    building_name = :building_name,
                    building_param = :building_param,
                    provider_campus = :provider_campus,
                    provider_building = :provider_building
                WHERE id = :room_id
                """
            ),
            {
                "room_id": row["id"],
                "building_key": MERGED_KEY,
                "building_name": MERGED_NAME,
                "building_param": MERGED_PARAM,
                "provider_campus": HWGL_CAMPUS,
                "provider_building": _provider_building(row),
            },
        )


def downgrade() -> None:
    # The canonical public name is intentionally retained on downgrade.  A
    # reverse split would reintroduce an ambiguous user-facing choice.
    pass
