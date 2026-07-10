import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import me as me_routes
from app.core.security import decode_access_token, hash_password, sign_access_token, token_matches_credentials, verify_password
from app.models.user import User
from app.schemas.auth import DeleteAccountRequest, PasswordUpdateRequest


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/me/password",
            "raw_path": b"/api/me/password",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


@pytest.fixture
def user_session(monkeypatch: pytest.MonkeyPatch) -> tuple[Session, User]:
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    db = Session(engine)
    user = User(email="student@example.com", password_hash=hash_password("old-password"), is_verified=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    monkeypatch.setattr(me_routes, "enforce_rate_limit", lambda *args, **kwargs: None)
    try:
        yield db, user
    finally:
        db.close()


def test_update_password_rejects_wrong_current_password(user_session: tuple[Session, User]) -> None:
    db, user = user_session
    original_hash = user.password_hash

    with pytest.raises(HTTPException) as exc_info:
        me_routes.update_my_password(
            make_request(),
            PasswordUpdateRequest(old_password="wrong-password", new_password="new-password"),
            user,
            db,
        )

    assert exc_info.value.status_code == 400
    assert user.password_hash == original_hash


def test_update_password_rejects_reusing_current_password(user_session: tuple[Session, User]) -> None:
    db, user = user_session
    original_hash = user.password_hash

    with pytest.raises(HTTPException) as exc_info:
        me_routes.update_my_password(
            make_request(),
            PasswordUpdateRequest(old_password="old-password", new_password="old-password"),
            user,
            db,
        )

    assert exc_info.value.status_code == 422
    assert user.password_hash == original_hash


def test_update_password_invalidates_old_token_and_returns_bound_token(user_session: tuple[Session, User]) -> None:
    db, user = user_session
    old_token = sign_access_token(user.id, kind="user", password_hash=user.password_hash)

    result = me_routes.update_my_password(
        make_request(),
        PasswordUpdateRequest(old_password="old-password", new_password="new-password"),
        user,
        db,
    )

    old_payload = decode_access_token(old_token)
    new_payload = decode_access_token(result.access_token)
    assert old_payload is not None
    assert new_payload is not None
    assert not token_matches_credentials(old_payload, user.password_hash)
    assert token_matches_credentials(new_payload, user.password_hash)
    assert verify_password("new-password", user.password_hash)
    assert not verify_password("old-password", user.password_hash)


@pytest.mark.parametrize("error_kind", ["token", "auth", "network", "http", "api", "parse", None])
def test_public_room_check_errors_do_not_expose_internal_details(error_kind: str | None) -> None:
    status_code, detail = me_routes.public_room_check_error(error_kind)

    assert status_code in {422, 502, 503}
    assert set(detail) == {"kind", "message"}
    assert detail["message"]


def test_delete_account_password_attempt_is_rate_limited(
    user_session: tuple[Session, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db, user = user_session
    rate_limit_calls: list[str] = []
    monkeypatch.setattr(
        me_routes,
        "enforce_rate_limit",
        lambda key, **kwargs: rate_limit_calls.append(key),
    )

    with pytest.raises(HTTPException) as exc_info:
        me_routes.delete_my_account(
            make_request(),
            DeleteAccountRequest(password="wrong-password"),
            user,
            db,
        )

    assert exc_info.value.status_code == 400
    assert len(rate_limit_calls) == 2
    assert any(f":account:{user.id}" in key for key in rate_limit_calls)
