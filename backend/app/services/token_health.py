from datetime import datetime

from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken
from app.models.auth_token_health_log import AuthTokenHealthLog


TOKEN_AUTH_FAILURE_LIMIT = 3


def record_token_health(
    db: Session,
    token: AuthToken,
    *,
    success: bool,
    source: str,
    error_kind: str | None = None,
    error_msg: str | None = None,
) -> None:
    checked_at = datetime.now()
    token.last_checked_at = checked_at

    if success:
        token.health_status = "healthy"
        token.failure_count = 0
        token.last_success_at = checked_at
        token.last_error_kind = None
        token.last_error_msg = None
    else:
        token.last_error_at = checked_at
        token.last_error_kind = error_kind
        token.last_error_msg = error_msg
        if error_kind == "auth":
            token.failure_count = (token.failure_count or 0) + 1
            token.health_status = "invalid" if token.failure_count >= TOKEN_AUTH_FAILURE_LIMIT else "warning"
            if token.failure_count >= TOKEN_AUTH_FAILURE_LIMIT:
                token.enabled = False
        elif error_kind in {"network", "http", "api"}:
            token.health_status = "warning"
        elif not token.health_status:
            token.health_status = "unknown"

    db.add(
        AuthTokenHealthLog(
            auth_token_id=token.id,
            source=source,
            success=success,
            error_kind=error_kind,
            error_msg=error_msg,
            health_status=token.health_status,
            failure_count=token.failure_count or 0,
        )
    )
