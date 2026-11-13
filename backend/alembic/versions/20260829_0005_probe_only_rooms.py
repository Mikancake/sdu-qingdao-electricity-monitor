"""Keep administrator-only custom HWGL probe rooms out of public data."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260829_0005"
down_revision = "20260828_0004"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    if not _has_column("rooms", "probe_only"):
        op.add_column(
            "rooms",
            sa.Column("probe_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute(sa.text("UPDATE rooms SET probe_only = FALSE WHERE probe_only IS NULL"))
    if not _has_index("rooms", "ix_rooms_provider_probe_only"):
        op.create_index(
            "ix_rooms_provider_probe_only",
            "rooms",
            ["provider", "probe_only"],
            unique=False,
        )


def downgrade() -> None:
    # Probe-only rows are part of the audit trail, so leave the column in
    # place on downgrade rather than risking data loss.
    pass
