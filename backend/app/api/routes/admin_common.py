import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.models.auth_token import AuthToken
from app.models.smtp_settings import SmtpSettings
from app.schemas.admin import AdminAuthTokenOut, SmtpSettingsOut


def audit(
    db: Session,
    admin: AdminUser,
    action: str,
    target_type: str,
    target_id: object | None,
    detail: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            admin_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            detail=json.dumps(detail or {}, ensure_ascii=False),
        )
    )


def preview_secret(value: str, *, head: int = 6, tail: int = 4) -> str:
    if len(value) <= head + tail:
        return "*" * len(value)
    return f"{value[:head]}...{value[-tail:]}"


def token_out(token: AuthToken) -> AdminAuthTokenOut:
    return AdminAuthTokenOut(
        id=token.id,
        name=token.name,
        token_preview=preview_secret(token.token_value),
        enabled=token.enabled,
        min_interval_seconds=token.min_interval_seconds,
        last_used_at=token.last_used_at,
        health_status=token.health_status or "unknown",
        failure_count=token.failure_count or 0,
        last_checked_at=token.last_checked_at,
        last_success_at=token.last_success_at,
        last_error_at=token.last_error_at,
        last_error_kind=token.last_error_kind,
        last_error_msg=token.last_error_msg,
        created_at=token.created_at,
    )


def smtp_out(row: SmtpSettings) -> SmtpSettingsOut:
    return SmtpSettingsOut(
        id=row.id,
        name=row.name or f"smtp-{row.id}",
        configured=bool(row.host and row.from_email),
        host=row.host,
        port=row.port,
        username=row.username,
        from_email=row.from_email,
        enabled=row.enabled,
        min_interval_seconds=row.min_interval_seconds or 0,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        password_configured=bool(row.password),
        last_used_at=row.last_used_at,
        health_status=row.health_status or "unknown",
        failure_count=row.failure_count or 0,
        last_checked_at=row.last_checked_at,
        last_success_at=row.last_success_at,
        last_error_at=row.last_error_at,
        last_error_kind=row.last_error_kind,
        last_error_msg=row.last_error_msg,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def next_smtp_id(db: Session) -> int:
    current_max = db.scalar(select(func.max(SmtpSettings.id))) or 0
    return int(current_max) + 1
