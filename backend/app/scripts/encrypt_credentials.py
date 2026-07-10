from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.auth_token import AuthToken
from app.models.smtp_settings import SmtpSettings


def encrypt_credentials(db: Session) -> tuple[int, int]:
    tokens = list(db.scalars(select(AuthToken)))
    smtp_rows = list(db.scalars(select(SmtpSettings).where(SmtpSettings.password.is_not(None))))
    for token in tokens:
        flag_modified(token, "token_value")
    for row in smtp_rows:
        flag_modified(row, "password")
    db.commit()
    return len(tokens), len(smtp_rows)


def main() -> int:
    if not settings.credential_encryption_key or len(settings.credential_encryption_key) < 32:
        raise SystemExit("set CREDENTIAL_ENCRYPTION_KEY to a random value of at least 32 characters first")

    with SessionLocal() as db:
        token_count, smtp_count = encrypt_credentials(db)
    print(f"encrypted credentials: auth_tokens={token_count}, smtp_passwords={smtp_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
