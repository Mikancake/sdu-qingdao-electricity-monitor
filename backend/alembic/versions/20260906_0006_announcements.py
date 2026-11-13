"""Add administrator announcements.

The baseline migration creates the current metadata, so this upgrade must also
work when the announcements table already exists.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260906_0006"
down_revision = "20260829_0005"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _indexes(table_name: str) -> set[str]:
    return {str(index["name"]) for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("announcements"):
        op.create_table(
            "announcements",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
    indexes = _indexes("announcements")
    if "ix_announcements_id" not in indexes:
        op.create_index("ix_announcements_id", "announcements", ["id"], unique=False)
    if "ix_announcements_is_published" not in indexes:
        op.create_index("ix_announcements_is_published", "announcements", ["is_published"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_announcements_is_published", table_name="announcements")
    op.drop_index("ix_announcements_id", table_name="announcements")
    op.drop_table("announcements")
