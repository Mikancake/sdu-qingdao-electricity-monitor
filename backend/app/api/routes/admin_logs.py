from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from app.api.deps import current_admin, db_session
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.models.auth_token import AuthToken
from app.models.auth_token_health_log import AuthTokenHealthLog
from app.models.smtp_health_log import SmtpHealthLog
from app.models.smtp_settings import SmtpSettings
from app.schemas.admin import AdminAuditLogOut, AdminAuthTokenHealthLogOut, SmtpHealthLogOut


router = APIRouter()


def search_pattern(q: str | None) -> str | None:
    value = (q or "").strip()
    return f"%{value}%" if value else None


def apply_log_window(
    stmt: Select,
    model: Any,
    *,
    days: int,
    limit: int,
    sort: Literal["asc", "desc"],
) -> Select:
    if days:
        stmt = stmt.where(model.created_at >= datetime.now() - timedelta(days=days))
    if sort == "asc":
        stmt = stmt.order_by(model.created_at.asc(), model.id.asc())
    else:
        stmt = stmt.order_by(model.created_at.desc(), model.id.desc())
    return stmt.limit(limit) if limit else stmt


@router.get("/tokens/health-logs", response_model=list[AdminAuthTokenHealthLogOut])
def list_token_health_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[AdminAuthTokenHealthLogOut]:
    stmt = select(AuthTokenHealthLog, AuthToken).outerjoin(
        AuthToken, AuthToken.id == AuthTokenHealthLog.auth_token_id
    )
    pattern = search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                AuthToken.name.ilike(pattern),
                AuthTokenHealthLog.source.ilike(pattern),
                AuthTokenHealthLog.error_kind.ilike(pattern),
                AuthTokenHealthLog.error_msg.ilike(pattern),
                AuthTokenHealthLog.health_status.ilike(pattern),
            )
        )
    stmt = apply_log_window(stmt, AuthTokenHealthLog, days=days, limit=limit, sort=sort)
    return [
        AdminAuthTokenHealthLogOut(
            id=log.id,
            token_id=log.auth_token_id,
            token_name=token.name if token else None,
            source=log.source,
            success=log.success,
            error_kind=log.error_kind,
            error_msg=log.error_msg,
            health_status=log.health_status,
            failure_count=log.failure_count,
            created_at=log.created_at,
        )
        for log, token in db.execute(stmt).all()
    ]


@router.get("/smtp/health-logs", response_model=list[SmtpHealthLogOut])
def list_smtp_health_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[SmtpHealthLogOut]:
    stmt = select(SmtpHealthLog, SmtpSettings).outerjoin(
        SmtpSettings, SmtpSettings.id == SmtpHealthLog.smtp_settings_id
    )
    pattern = search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                SmtpSettings.name.ilike(pattern),
                SmtpHealthLog.source.ilike(pattern),
                SmtpHealthLog.recipient_email.ilike(pattern),
                SmtpHealthLog.error_kind.ilike(pattern),
                SmtpHealthLog.error_msg.ilike(pattern),
                SmtpHealthLog.health_status.ilike(pattern),
            )
        )
    stmt = apply_log_window(stmt, SmtpHealthLog, days=days, limit=limit, sort=sort)
    return [
        SmtpHealthLogOut(
            id=log.id,
            smtp_id=log.smtp_settings_id,
            smtp_name=smtp.name if smtp else None,
            source=log.source,
            recipient_email=log.recipient_email,
            success=log.success,
            error_kind=log.error_kind,
            error_msg=log.error_msg,
            health_status=log.health_status,
            failure_count=log.failure_count,
            created_at=log.created_at,
        )
        for log, smtp in db.execute(stmt).all()
    ]


@router.get("/audit-logs", response_model=list[AdminAuditLogOut])
def list_audit_logs(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
    days: int = Query(7, ge=0, le=365),
    limit: int = Query(200, ge=0, le=1000),
    q: str | None = Query(None, max_length=120),
    sort: Literal["asc", "desc"] = Query("desc"),
) -> list[AdminAuditLog]:
    stmt = select(AdminAuditLog)
    pattern = search_pattern(q)
    if pattern:
        stmt = stmt.where(
            or_(
                AdminAuditLog.action.ilike(pattern),
                AdminAuditLog.target_type.ilike(pattern),
                AdminAuditLog.target_id.ilike(pattern),
                AdminAuditLog.detail.ilike(pattern),
            )
        )
    stmt = apply_log_window(stmt, AdminAuditLog, days=days, limit=limit, sort=sort)
    return list(db.scalars(stmt))
