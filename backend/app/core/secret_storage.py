import base64
import hashlib
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.config import settings


ENCRYPTED_PREFIX = "enc:v1:"
ASSOCIATED_DATA = b"electricity-monitor-credential-v1"


class SecretDecryptionError(RuntimeError):
    pass


def encrypt_secret(value: str | None) -> str | None:
    if value is None or value.startswith(ENCRYPTED_PREFIX):
        return value
    key = _current_key()
    if key is None:
        if settings.debug or settings.allow_insecure_startup:
            return value
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is required before storing credentials")
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, value.encode("utf-8"), ASSOCIATED_DATA)
    payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return f"{ENCRYPTED_PREFIX}{payload}"


def decrypt_secret(value: str | None) -> str | None:
    if value is None or not value.startswith(ENCRYPTED_PREFIX):
        return value
    try:
        payload = base64.b64decode(
            value[len(ENCRYPTED_PREFIX) :],
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, base64.binascii.Error) as exc:
        raise SecretDecryptionError("stored credential has an invalid encrypted format") from exc
    if len(payload) < 12 + 16:
        raise SecretDecryptionError("stored credential has an invalid encrypted format")
    nonce, ciphertext = payload[:12], payload[12:]
    for key in _decryption_keys():
        try:
            return AESGCM(key).decrypt(nonce, ciphertext, ASSOCIATED_DATA).decode("utf-8")
        except (InvalidTag, UnicodeDecodeError):
            continue
    raise SecretDecryptionError("stored credential cannot be decrypted with the configured keys")


class EncryptedText(TypeDecorator[str]):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, _dialect) -> str | None:
        return encrypt_secret(value)

    def process_result_value(self, value: str | None, _dialect) -> str | None:
        return decrypt_secret(value)


def _derive_key(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def _current_key() -> bytes | None:
    value = settings.credential_encryption_key
    return _derive_key(value) if value else None


def _decryption_keys() -> list[bytes]:
    values = []
    if settings.credential_encryption_key:
        values.append(settings.credential_encryption_key)
    values.extend(item.strip() for item in settings.credential_encryption_old_keys.split(",") if item.strip())
    return [_derive_key(value) for value in dict.fromkeys(values)]
