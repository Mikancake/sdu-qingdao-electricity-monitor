import argparse

from sqlalchemy import select

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.auth_token import AuthToken


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Add or update a campus API token in the local database.")
    parser.add_argument("--name", required=True, help="Token name shown in logs, for example local_1")
    parser.add_argument("--value", required=True, help="Full Synjones-Auth value, for example 'bearer xxx'")
    parser.add_argument("--disabled", action="store_true", help="Store the token but keep it disabled")
    parser.add_argument("--min-interval-seconds", type=int, default=10)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        token = db.scalar(select(AuthToken).where(AuthToken.name == args.name))
        if token is None:
            token = AuthToken(name=args.name, token_value=args.value)
            db.add(token)
            action = "created"
        else:
            token.token_value = args.value
            action = "updated"
        token.enabled = not args.disabled
        token.min_interval_seconds = args.min_interval_seconds
        db.commit()
    print(f"token {action}: {args.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())