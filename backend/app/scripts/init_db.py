from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.schema import create_schema
from app.db.session import engine
from app.services.admins import ensure_initial_admin


def alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    return config


def main() -> int:
    config = alembic_config()
    tables_before = set(inspect(engine).get_table_names())
    if "alembic_version" not in tables_before and tables_before.intersection(Base.metadata.tables):
        # The compatibility bridge covers the pre-Alembic schema through
        # probe-only rooms. create_all won't alter existing announcements;
        # let the subsequent idempotent migrations reconcile that table.
        create_schema(engine, ensure_admin=False)
        command.stamp(config, "20260829_0005")
    # Empty databases start at the baseline; versioned ones resume in place.
    command.upgrade(config, "head")
    with Session(engine) as db:
        ensure_initial_admin(db)

    with engine.connect() as connection:
        revision = MigrationContext.configure(connection).get_current_revision()
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"database ready (revision {revision}): {tables}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
