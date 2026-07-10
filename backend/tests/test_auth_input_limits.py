import pytest
from pydantic import ValidationError

from app.schemas.auth import EmailVerifyRequest, UserLogin


def test_login_password_has_a_hard_length_limit() -> None:
    with pytest.raises(ValidationError):
        UserLogin(email="student@example.com", password="x" * 129)


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef"])
def test_verification_code_must_be_six_digits(code: str) -> None:
    with pytest.raises(ValidationError):
        EmailVerifyRequest(email="student@example.com", code=code, password="valid-password")


def test_registration_verification_requires_the_registration_password() -> None:
    with pytest.raises(ValidationError):
        EmailVerifyRequest(email="student@example.com", code="123456")
