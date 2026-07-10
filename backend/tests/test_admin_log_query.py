from sqlalchemy import select
from sqlalchemy.dialects import sqlite

from app.api.routes.admin_logs import apply_log_window
from app.models.admin_audit_log import AdminAuditLog


def compile_query(days: int, limit: int) -> str:
    stmt = apply_log_window(
        select(AdminAuditLog),
        AdminAuditLog,
        days=days,
        limit=limit,
        sort="desc",
    )
    return str(stmt.compile(dialect=sqlite.dialect())).upper()


def test_zero_days_and_limit_leave_query_unbounded() -> None:
    keywords = compile_query(days=0, limit=0).split()

    assert "WHERE" not in keywords
    assert "LIMIT" not in keywords
    assert "ORDER" in keywords
    assert "BY" in keywords


def test_positive_days_and_limit_are_applied() -> None:
    keywords = compile_query(days=7, limit=100).split()

    assert "WHERE" in keywords
    assert "LIMIT" in keywords
