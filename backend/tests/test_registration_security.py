from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import auth as auth_routes
from app.core.security import hash_password, hash_verification_code, verify_password
from app.models.email_verification_code import EmailVerificationCode
from app.models.user import User
from app.schemas.auth import EmailVerifyRequest


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/auth/verify-email",
            "raw_path": b"/api/auth/verify-email",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


def test_verification_code_cannot_accept_a_different_registration_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    EmailVerificationCode.__table__.create(engine)
    monkeypatch.setattr(auth_routes, "enforce_rate_limit", lambda *args, **kwargs: None)

    with Session(engine) as db:
        db.add(
            EmailVerificationCode(
                email="student@example.com",
                code_hash=hash_verification_code("123456"),
                password_hash=hash_password("registration-password"),
                purpose="register",
                expires_at=datetime.now() + timedelta(minutes=15),
            )
        )
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            auth_routes.verify_email(
                make_request(),
                EmailVerifyRequest(
                    email="student@example.com",
                    code="123456",
                    password="different-password",
                ),
                db,
            )

        assert exc_info.value.status_code == 400
        assert db.scalar(select(User).where(User.email == "student@example.com")) is None

        user = auth_routes.verify_email(
            make_request(),
            EmailVerifyRequest(
                email="student@example.com",
                code="123456",
                password="registration-password",
            ),
            db,
        )
        assert user.is_verified is True
        assert verify_password("registration-password", user.password_hash)
