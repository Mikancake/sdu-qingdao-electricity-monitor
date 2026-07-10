import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings


PASSWORD_ITERATIONS = 600_000
MAX_PASSWORD_LENGTH = 128
MAX_ACCESS_TOKEN_LENGTH = 4096


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.b64decode(value + padding, altchars=b"-_", validate=True)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def verify_password(password: str, password_hash: str) -> bool:
    if len(password) > MAX_PASSWORD_LENGTH:
        return False
    try:
        algorithm, iterations_text, salt_text, digest_text = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        if iterations < 100_000 or iterations > 1_000_000:
            return False
        salt = _b64decode(salt_text)
        expected = _b64decode(digest_text)
    except (ValueError, TypeError, base64.binascii.Error):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def password_needs_rehash(password_hash: str) -> bool:
    try:
        algorithm, iterations_text, _salt_text, _digest_text = password_hash.split("$", 3)
        return algorithm != "pbkdf2_sha256" or int(iterations_text) < PASSWORD_ITERATIONS
    except (ValueError, TypeError):
        return True


def credential_stamp(password_hash: str) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        b"credential-stamp\x00" + password_hash.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def token_matches_credentials(payload: dict[str, Any], password_hash: str) -> bool:
    token_stamp = payload.get("auth")
    return isinstance(token_stamp, str) and hmac.compare_digest(token_stamp, credential_stamp(password_hash))


def sign_access_token(subject: int | str, *, kind: str = "user", password_hash: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(subject),
        "kind": kind,
        "auth": credential_stamp(password_hash),
        "exp": int(expires_at.timestamp()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_part = _b64encode(payload_bytes)
    signature = hmac.new(settings.secret_key.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_part}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any] | None:
    if not token or len(token) > MAX_ACCESS_TOKEN_LENGTH:
        return None
    try:
        payload_part, signature_part = token.split(".", 1)
        if not payload_part or not signature_part or len(payload_part) > 2048:
            return None
        expected = hmac.new(settings.secret_key.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest()
        actual = _b64decode(signature_part)
        if len(actual) != hashlib.sha256().digest_size or not hmac.compare_digest(expected, actual):
            return None
        payload = json.loads(_b64decode(payload_part))
        if not isinstance(payload, dict):
            return None
        if not isinstance(payload.get("sub"), str) or payload.get("kind") not in {"user", "admin"}:
            return None
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError, base64.binascii.Error):
        return None


def hash_verification_code(code: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hmac.new(
        settings.secret_key.encode("utf-8"),
        b"verification-code\x00" + salt + code.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"hmac_sha256${_b64encode(salt)}${_b64encode(digest)}"


def verify_verification_code(code: str, code_hash: str) -> bool:
    if len(code) > 12:
        return False
    if not code_hash.startswith("hmac_sha256$"):
        return verify_password(code, code_hash)
    try:
        algorithm, salt_text, digest_text = code_hash.split("$", 2)
        if algorithm != "hmac_sha256":
            return False
        salt = _b64decode(salt_text)
        expected = _b64decode(digest_text)
    except (ValueError, TypeError, base64.binascii.Error):
        return False
    actual = hmac.new(
        settings.secret_key.encode("utf-8"),
        b"verification-code\x00" + salt + code.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return hmac.compare_digest(actual, expected)


def generate_numeric_code(length: int = 6) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))
