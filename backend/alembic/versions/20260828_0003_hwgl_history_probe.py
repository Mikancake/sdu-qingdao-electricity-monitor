"""Store HWGL daily metadata, recharge history, and isolated probe samples.

The migration is intentionally idempotent because older installations were
bootstrapped with ``create_schema`` instead of a complete Alembic history.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260828_0003"
down_revision = "20260828_0002"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _columns(table_name: str) -> set[str]:
    return {str(column["name"]) for column in _inspector().get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {str(index["name"]) for index in _inspector().get_indexes(table_name)}


def _add_columns(table_name: str, additions: dict[str, sa.Column]) -> None:
    missing = [column for name, column in additions.items() if name not in _columns(table_name)]
    if not missing:
        return
    with op.batch_alter_table(table_name) as batch:
        for column in missing:
            batch.add_column(column)


def _create_index_if_missing(name: str, table_name: str, columns: list[str]) -> None:
    if name not in _indexes(table_name):
        op.create_index(name, table_name, columns, unique=False)


def upgrade() -> None:
    _add_columns(
        "rooms",
        {
            "provider_price": sa.Column("provider_price", sa.Numeric(10, 4), nullable=True),
            "provider_price_updated_at": sa.Column("provider_price_updated_at", sa.DateTime(timezone=True), nullable=True),
        },
    )
    _add_columns(
        "electricity_readings",
        {
            "free_electricity": sa.Column("free_electricity", sa.Numeric(10, 4), nullable=True),
            "paid_electricity": sa.Column("paid_electricity", sa.Numeric(10, 4), nullable=True),
            "arrears_electricity": sa.Column("arrears_electricity", sa.Numeric(10, 4), nullable=True),
            "electricity_price": sa.Column("electricity_price", sa.Numeric(10, 4), nullable=True),
            "estimated_amount": sa.Column("estimated_amount", sa.Numeric(10, 2), nullable=True),
        },
    )

    table_names = set(_inspector().get_table_names())
    if "electricity_recharges" not in table_names:
        op.create_table(
            "electricity_recharges",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
            sa.Column("provider", sa.String(length=20), nullable=False, server_default="hwgl"),
            sa.Column("external_id_hash", sa.String(length=64), nullable=False),
            sa.Column("external_id_tail", sa.String(length=12), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("line_type", sa.String(length=80), nullable=True),
            sa.Column("payment_status", sa.String(length=80), nullable=True),
            sa.Column("processing_status", sa.String(length=80), nullable=True),
            sa.Column("source", sa.String(length=40), nullable=False, server_default="hwgl_recharge_sync"),
            sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("room_id", "provider", "external_id_hash", name="uq_electricity_recharge_external"),
        )

    if "hwgl_probe_sessions" not in table_names:
        op.create_table(
            "hwgl_probe_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
            sa.Column("admin_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("interval_seconds", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="3600"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("next_run_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unique_snapshot_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("summary_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    table_names = set(_inspector().get_table_names())
    if "hwgl_probe_samples" not in table_names:
        op.create_table(
            "hwgl_probe_samples",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("hwgl_probe_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("provider_updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("balance", sa.Numeric(10, 4), nullable=True),
            sa.Column("reported_daily_usage", sa.Numeric(10, 4), nullable=True),
            sa.Column("power_status", sa.String(length=80), nullable=True),
            sa.Column("response_hash", sa.String(length=64), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
            sa.Column("http_status", sa.Integer(), nullable=True),
            sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("error_kind", sa.String(length=80), nullable=True),
            sa.Column("error_msg", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    _create_index_if_missing("ix_electricity_recharges_room_paid_at", "electricity_recharges", ["room_id", "paid_at"])
    _create_index_if_missing("ix_electricity_recharges_provider_status", "electricity_recharges", ["provider", "processing_status"])
    _create_index_if_missing("ix_hwgl_probe_sessions_status_next_run", "hwgl_probe_sessions", ["status", "next_run_at"])
    _create_index_if_missing("ix_hwgl_probe_sessions_room_created", "hwgl_probe_sessions", ["room_id", "created_at"])
    _create_index_if_missing("ix_hwgl_probe_samples_session_requested", "hwgl_probe_samples", ["session_id", "requested_at"])
    _create_index_if_missing("ix_hwgl_probe_samples_session_snapshot", "hwgl_probe_samples", ["session_id", "response_hash"])


def downgrade() -> None:
    # Do not remove production history or probe data on downgrade.
    pass
