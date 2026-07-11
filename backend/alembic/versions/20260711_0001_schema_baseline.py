"""Baseline the current Electricity Monitor schema.

Revision ID: 20260711_0001
Revises: None
"""

from alembic import op

from app import models  # noqa: F401
from app.db.base import Base


revision = "20260711_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fresh installations can run Alembic directly. Existing installations are
    # reconciled once by app.scripts.init_db before this baseline is stamped.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    # A baseline downgrade must never delete an existing production database.
    pass
