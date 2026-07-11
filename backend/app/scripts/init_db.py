from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db.base import Base
from app.db.schema import create_schema
from app.db.session import SessionLocal, engine
from app.services.admins import ensure_initial_admin


def alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    return config


def main() -> int:
    config = alembic_config()
    if not inspect(engine).has_table("alembic_version"):
        # One-time compatibility bridge for databases created before Alembic.
        create_schema(engine)
        command.stamp(config, "head")
    else:
        command.upgrade(config, "head")
        with SessionLocal() as db:
            ensure_initial_admin(db)

    with engine.connect() as connection:
        revision = MigrationContext.configure(connection).get_current_revision()
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"database ready (revision {revision}): {tables}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
