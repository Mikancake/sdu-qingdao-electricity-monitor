"""Add a visibility scope to administrator announcements.

``users`` announcements stay login-only, ``public`` ones are also shown on the
registration/login screen. The migration is idempotent for the current-schema
baseline used by fresh installations.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260907_0007"
down_revision = "20260906_0006"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {str(column["name"]) for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {str(index["name"]) for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    if "visibility" not in _columns("announcements"):
        op.add_column(
            "announcements",
            sa.Column("visibility", sa.String(length=20), nullable=False, server_default="users"),
        )
    if "ix_announcements_visibility" not in _indexes("announcements"):
        op.create_index("ix_announcements_visibility", "announcements", ["visibility"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_announcements_visibility", table_name="announcements")
    op.drop_column("announcements", "visibility")
