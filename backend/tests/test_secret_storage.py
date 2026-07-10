import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.secret_storage import ENCRYPTED_PREFIX, SecretDecryptionError, decrypt_secret, encrypt_secret
from app.models.auth_token import AuthToken
from app.models.smtp_settings import SmtpSettings
from app.scripts.encrypt_credentials import encrypt_credentials


def test_secret_round_trip_and_random_nonce(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "k" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "")

    first = encrypt_secret("sensitive value")
    second = encrypt_secret("sensitive value")

    assert first is not None and first.startswith(ENCRYPTED_PREFIX)
    assert second is not None and first != second
    assert decrypt_secret(first) == "sensitive value"


def test_old_key_can_decrypt_during_rotation(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "o" * 32)
    encrypted = encrypt_secret("sensitive value")
    monkeypatch.setattr(settings, "credential_encryption_key", "n" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "o" * 32)

    assert decrypt_secret(encrypted) == "sensitive value"


def test_wrong_key_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "a" * 32)
    encrypted = encrypt_secret("sensitive value")
    monkeypatch.setattr(settings, "credential_encryption_key", "b" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "")

    with pytest.raises(SecretDecryptionError):
        decrypt_secret(encrypted)


def test_missing_key_fails_closed_outside_debug(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", None)
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "allow_insecure_startup", False)

    with pytest.raises(RuntimeError, match="CREDENTIAL_ENCRYPTION_KEY"):
        encrypt_secret("sensitive value")


def test_model_columns_store_ciphertext_and_return_plaintext(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "k" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "")
    engine = create_engine("sqlite://")
    AuthToken.__table__.create(engine)
    SmtpSettings.__table__.create(engine)

    with Session(engine) as db:
        db.add(AuthToken(name="test", token_value="plain-token-value"))
        db.add(SmtpSettings(id=1, name="test", password="plain-smtp-password"))
        db.commit()

    with engine.connect() as connection:
        stored_token = connection.execute(text("SELECT token_value FROM auth_tokens")).scalar_one()
        stored_password = connection.execute(text("SELECT password FROM smtp_settings")).scalar_one()
    assert stored_token.startswith(ENCRYPTED_PREFIX)
    assert stored_password.startswith(ENCRYPTED_PREFIX)
    assert "plain-token-value" not in stored_token
    assert "plain-smtp-password" not in stored_password

    with Session(engine) as db:
        assert db.get(AuthToken, 1).token_value == "plain-token-value"
        assert db.get(SmtpSettings, 1).password == "plain-smtp-password"


def test_migration_encrypts_legacy_plaintext_rows(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "k" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "")
    engine = create_engine("sqlite://")
    AuthToken.__table__.create(engine)
    SmtpSettings.__table__.create(engine)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO auth_tokens "
                "(name, token_value, enabled, min_interval_seconds, health_status, failure_count) "
                "VALUES ('legacy', 'plain-legacy-token', 1, 10, 'unknown', 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO smtp_settings "
                "(id, name, password, port, enabled, min_interval_seconds, use_ssl, use_starttls, "
                "health_status, failure_count) "
                "VALUES (1, 'legacy', 'plain-legacy-password', 465, 1, 0, 1, 0, 'unknown', 0)"
            )
        )

    with Session(engine) as db:
        assert encrypt_credentials(db) == (1, 1)

    with engine.connect() as connection:
        stored_token = connection.execute(text("SELECT token_value FROM auth_tokens")).scalar_one()
        stored_password = connection.execute(text("SELECT password FROM smtp_settings")).scalar_one()
    assert stored_token.startswith(ENCRYPTED_PREFIX)
    assert stored_password.startswith(ENCRYPTED_PREFIX)
    assert "plain-legacy" not in stored_token
    assert "plain-legacy" not in stored_password
