import pytest
from pydantic import ValidationError

from app.schemas.admin import AdminAuthTokenCreate, AdminAuthTokenUpdate, SmtpSettingsCreate, SmtpSettingsUpdate
from app.schemas.auth import EmailVerifyRequest, UserLogin


def test_login_password_has_a_hard_length_limit() -> None:
    with pytest.raises(ValidationError):
        UserLogin(email="student@example.com", password="x" * 129)


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "１２３４５６"])
def test_verification_code_must_be_six_digits(code: str) -> None:
    with pytest.raises(ValidationError):
        EmailVerifyRequest(email="student@example.com", code=code, password="valid-password")


def test_registration_verification_requires_the_registration_password() -> None:
    with pytest.raises(ValidationError):
        EmailVerifyRequest(email="student@example.com", code="123456")


def test_admin_text_constraints_apply_to_stored_values() -> None:
    token = AdminAuthTokenCreate(name=" Token ", token_value=" 1234567890 ")
    assert (token.name, token.token_value) == ("Token", "1234567890")
    with pytest.raises(ValidationError):
        AdminAuthTokenUpdate(token_value=" short    ")
    with pytest.raises(ValidationError):
        SmtpSettingsUpdate(host="  ")
    smtp = SmtpSettingsCreate(name=" SMTP ", host=" mail.example.com ", from_email=" sender@example.com ", password=" value ")
    assert (smtp.name, smtp.host, smtp.from_email) == ("SMTP", "mail.example.com", "sender@example.com")
    assert smtp.password == " value "
