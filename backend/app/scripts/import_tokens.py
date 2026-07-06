import argparse
from pathlib import Path

import yaml
from sqlalchemy import select

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.auth_token import AuthToken


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import campus API tokens from tokens.yaml.")
    parser.add_argument("--file", default="../tokens.yaml", help="Path to tokens.yaml")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"token file not found: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    token_items = raw.get("tokens") or []
    if not isinstance(token_items, list):
        raise SystemExit("tokens.yaml must contain a tokens list")

    Base.metadata.create_all(bind=engine)
    imported = 0
    with SessionLocal() as db:
        for item in token_items:
            name = str(item.get("name") or item.get("id") or "").strip()
            value = str(item.get("value") or item.get("token") or "").strip()
            if not name or not value:
                continue
            token = db.scalar(select(AuthToken).where(AuthToken.name == name))
            if token is None:
                token = AuthToken(name=name, token_value=value)
                db.add(token)
            else:
                token.token_value = value
            token.enabled = bool(item.get("enabled", True))
            token.min_interval_seconds = int(item.get("min_interval_seconds", 10))
            imported += 1
        db.commit()

    print(f"tokens imported: {imported}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
