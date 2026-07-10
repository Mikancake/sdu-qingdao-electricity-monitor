import pytest

from app.core.config import settings, validate_runtime_safety
from app.core.security import (
    decode_access_token,
    hash_password,
    hash_verification_code,
    password_needs_rehash,
    sign_access_token,
    token_matches_credentials,
    verify_password,
    verify_verification_code,
)


def test_access_token_is_bound_to_current_password_hash() -> None:
    password_hash = hash_password("correct horse battery staple")
    token = sign_access_token(7, kind="user", password_hash=password_hash)
    payload = decode_access_token(token)

    assert payload is not None
    assert token_matches_credentials(payload, password_hash)
    assert not token_matches_credentials(payload, hash_password("a different password"))


def test_malformed_and_oversized_access_tokens_are_rejected() -> None:
    assert decode_access_token("not-a-token") is None
    assert decode_access_token("x" * 4097) is None


def test_password_verification_rejects_oversized_input() -> None:
    password_hash = hash_password("valid-password")
    assert verify_password("x" * 129, password_hash) is False


def test_current_password_hash_does_not_need_rehash() -> None:
    assert password_needs_rehash(hash_password("valid-password")) is False


def test_verification_code_hash_is_keyed_salted_and_legacy_compatible() -> None:
    first = hash_verification_code("123456")
    second = hash_verification_code("123456")

    assert first != second
    assert verify_verification_code("123456", first)
    assert not verify_verification_code("654321", first)

    legacy = hash_password("123456")
    assert verify_verification_code("123456", legacy)


def test_production_requires_independent_credential_encryption_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "allow_insecure_startup", False)
    monkeypatch.setattr(settings, "secret_key", "s" * 32)
    monkeypatch.setattr(settings, "credential_encryption_key", None)

    with pytest.raises(RuntimeError, match="CREDENTIAL_ENCRYPTION_KEY"):
        validate_runtime_safety()
