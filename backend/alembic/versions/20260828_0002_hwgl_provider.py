"""Add provider-aware rooms and HWGL reading metadata.

Revision ID: 20260828_0002
Revises: 20260711_0001
"""

from __future__ import annotations

import re

import sqlalchemy as sa
from alembic import op


revision = "20260828_0002"
down_revision = "20260711_0001"
branch_labels = None
depends_on = None


HWGL_CAMPUS = "山东大学青岛校区"
LEGACY_KEY = "fenghuang_11_13"
LEGACY_PARAM = "1599193777&凤凰居11/13号楼"


def _room_number(value: object) -> int | None:
    match = re.search(r"(\d{3})$", str(value or "").strip())
    return int(match.group(1)) if match else None


def _new_building(room_number: object) -> tuple[str, str] | None:
    number = _room_number(room_number)
    if number is None:
        return None
    if 108 <= number <= 119 or 201 <= number <= 219 or 301 <= number <= 319 or 401 <= number <= 419:
        return "fenghuang_11", "凤凰居11公寓"
    if 220 <= number <= 242 or 320 <= number <= 344 or 420 <= number <= 445 or 501 <= number <= 523 or 601 <= number <= 618:
        return "fenghuang_13", "凤凰居13公寓"
    return None


def _backfill_legacy_rooms() -> None:
    connection = op.get_bind()
    rows = list(
        connection.execute(
            sa.text(
                """
                SELECT id, room_number
                FROM rooms
                WHERE building_key = :legacy_key OR building_param = :legacy_param
                """
            ),
            {"legacy_key": LEGACY_KEY, "legacy_param": LEGACY_PARAM},
        ).mappings()
    )
    for row in rows:
        building = _new_building(row["room_number"])
        if building is None:
            key, name = LEGACY_KEY, "凤凰居11/13号楼"
            provider_building = None
        else:
            key, name = building
            provider_building = name
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
                "building_key": key,
                "building_name": name,
                "building_param": f"hwgl&{name}",
                "provider_campus": HWGL_CAMPUS,
                "provider_building": provider_building,
            },
        )


def _columns(table_name: str) -> dict[str, dict]:
    return {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    room_columns = _columns("rooms")
    room_additions = {
        "provider": sa.Column("provider", sa.String(length=20), nullable=True, server_default="mcard"),
        "provider_room_key": sa.Column("provider_room_key", sa.String(length=80), nullable=True),
        "provider_line_id": sa.Column("provider_line_id", sa.String(length=40), nullable=True),
        "provider_campus": sa.Column("provider_campus", sa.String(length=120), nullable=True),
        "provider_building": sa.Column("provider_building", sa.String(length=120), nullable=True),
        "provider_floor": sa.Column("provider_floor", sa.String(length=40), nullable=True),
    }
    if missing := [column for name, column in room_additions.items() if name not in room_columns]:
        with op.batch_alter_table("rooms") as batch:
            for column in missing:
                batch.add_column(column)

    reading_columns = _columns("electricity_readings")
    reading_additions = {
        "provider": sa.Column("provider", sa.String(length=20), nullable=True, server_default="mcard"),
        "provider_updated_at": sa.Column("provider_updated_at", sa.DateTime(timezone=True), nullable=True),
        "reported_daily_usage": sa.Column("reported_daily_usage", sa.Numeric(10, 4), nullable=True),
        "reported_usage_date": sa.Column("reported_usage_date", sa.Date(), nullable=True),
        "power_status": sa.Column("power_status", sa.String(length=80), nullable=True),
    }
    if missing := [column for name, column in reading_additions.items() if name not in reading_columns]:
        with op.batch_alter_table("electricity_readings") as batch:
            for column in missing:
                batch.add_column(column)

    op.execute("UPDATE rooms SET provider = 'mcard' WHERE provider IS NULL OR provider = ''")
    op.execute("UPDATE electricity_readings SET provider = 'mcard' WHERE provider IS NULL OR provider = ''")
    _backfill_legacy_rooms()

    if _columns("rooms")["provider"].get("nullable", True):
        with op.batch_alter_table("rooms") as batch:
            batch.alter_column("provider", existing_type=sa.String(length=20), nullable=False, server_default="mcard")
    if _columns("electricity_readings")["provider"].get("nullable", True):
        with op.batch_alter_table("electricity_readings") as batch:
            batch.alter_column("provider", existing_type=sa.String(length=20), nullable=False, server_default="mcard")

    room_indexes = _index_names("rooms")
    if "ix_rooms_provider" not in room_indexes:
        op.create_index("ix_rooms_provider", "rooms", ["provider"], unique=False)
    if "ix_rooms_provider_room_key" not in room_indexes:
        op.create_index("ix_rooms_provider_room_key", "rooms", ["provider", "provider_room_key"], unique=False)

    reading_indexes = _index_names("electricity_readings")
    if "ix_electricity_readings_provider" not in reading_indexes:
        op.create_index("ix_electricity_readings_provider", "electricity_readings", ["provider"], unique=False)
    if "ix_electricity_readings_room_provider_updated" not in reading_indexes:
        op.create_index(
            "ix_electricity_readings_room_provider_updated",
            "electricity_readings",
            ["room_id", "provider_updated_at"],
            unique=False,
        )
    if "ix_electricity_readings_room_reported_date" not in reading_indexes:
        op.create_index(
            "ix_electricity_readings_room_reported_date",
            "electricity_readings",
            ["room_id", "reported_usage_date"],
            unique=False,
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE rooms
            SET building_key = :legacy_key,
                building_name = '凤凰居11/13号楼',
                building_param = :legacy_param
            WHERE provider = 'hwgl'
              AND building_key IN ('fenghuang_11', 'fenghuang_13', 'fenghuang_11_13')
            """
        ),
        {"legacy_key": LEGACY_KEY, "legacy_param": LEGACY_PARAM},
    )

    op.drop_index("ix_electricity_readings_room_reported_date", table_name="electricity_readings")
    op.drop_index("ix_electricity_readings_room_provider_updated", table_name="electricity_readings")
    op.drop_index("ix_electricity_readings_provider", table_name="electricity_readings")
    op.drop_index("ix_rooms_provider_room_key", table_name="rooms")
    op.drop_index("ix_rooms_provider", table_name="rooms")

    with op.batch_alter_table("electricity_readings") as batch:
        batch.drop_column("power_status")
        batch.drop_column("reported_usage_date")
        batch.drop_column("reported_daily_usage")
        batch.drop_column("provider_updated_at")
        batch.drop_column("provider")
    with op.batch_alter_table("rooms") as batch:
        batch.drop_column("provider_floor")
        batch.drop_column("provider_building")
        batch.drop_column("provider_campus")
        batch.drop_column("provider_line_id")
        batch.drop_column("provider_room_key")
        batch.drop_column("provider")
