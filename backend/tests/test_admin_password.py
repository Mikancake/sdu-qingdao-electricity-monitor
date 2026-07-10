import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import admin as admin_routes
from app.core.security import decode_access_token, hash_password, sign_access_token, token_matches_credentials
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_user import AdminUser
from app.schemas.admin import AdminPasswordUpdate


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/admin/auth/password",
            "raw_path": b"/api/admin/auth/password",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


@pytest.fixture
def admin_session() -> tuple[Session, AdminUser]:
    engine = create_engine("sqlite://")
    AdminUser.__table__.create(engine)
    AdminAuditLog.__table__.create(engine)
    db = Session(engine)
    admin = AdminUser(username="admin", password_hash=hash_password("old-password"), enabled=True)
    db.add(admin)
    db.commit()
    db.refresh(admin)
    try:
        yield db, admin
    finally:
        db.close()


def test_admin_password_update_returns_new_token_and_enforces_limits(
    admin_session: tuple[Session, AdminUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db, admin = admin_session
    old_token = sign_access_token(admin.id, kind="admin", password_hash=admin.password_hash)
    rate_limit_calls: list[str] = []
    monkeypatch.setattr(
        admin_routes,
        "enforce_rate_limit",
        lambda key, **kwargs: rate_limit_calls.append(key),
    )

    result = admin_routes.update_admin_password(
        make_request(),
        AdminPasswordUpdate(old_password="old-password", new_password="new-password"),
        admin,
        db,
    )

    old_payload = decode_access_token(old_token)
    new_payload = decode_access_token(result.access_token)
    assert old_payload is not None
    assert new_payload is not None
    assert not token_matches_credentials(old_payload, admin.password_hash)
    assert token_matches_credentials(new_payload, admin.password_hash)
    assert len(rate_limit_calls) == 2
    assert any(":account:admin" in key for key in rate_limit_calls)


def test_admin_password_update_rejects_current_password(
    admin_session: tuple[Session, AdminUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db, admin = admin_session
    monkeypatch.setattr(admin_routes, "enforce_rate_limit", lambda *args, **kwargs: None)

    with pytest.raises(HTTPException) as exc_info:
        admin_routes.update_admin_password(
            make_request(),
            AdminPasswordUpdate(old_password="old-password", new_password="old-password"),
            admin,
            db,
        )

    assert exc_info.value.status_code == 422
