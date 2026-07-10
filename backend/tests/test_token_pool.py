from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_token import AuthToken
from app.services.token_pool import select_available_token


def test_token_selection_reserves_before_returning_and_rotates(monkeypatch) -> None:
    monkeypatch.setattr(settings, "credential_encryption_key", "k" * 32)
    monkeypatch.setattr(settings, "credential_encryption_old_keys", "")
    engine = create_engine("sqlite://")
    AuthToken.__table__.create(engine)

    with Session(engine) as db:
        db.add_all(
            [
                AuthToken(name="first", token_value="first-token", min_interval_seconds=60, enabled=True),
                AuthToken(name="second", token_value="second-token", min_interval_seconds=60, enabled=True),
            ]
        )
        db.commit()

        first = select_available_token(db)
        second = select_available_token(db)
        unavailable = select_available_token(db)

        assert first is not None and first.name == "first"
        assert second is not None and second.name == "second"
        assert first.last_used_at is not None
        assert second.last_used_at is not None
        assert unavailable is None
