import logging.config

import pytest
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.core.config import settings
from app.db import schema
from app.scripts import init_db


@pytest.mark.parametrize("legacy", [False, True])
def test_init_db_upgrades_fresh_and_unversioned_sqlite(tmp_path, monkeypatch, legacy) -> None:
    url = f"sqlite:///{(tmp_path / 'test.sqlite3').as_posix()}"
    engine = create_engine(url)
    monkeypatch.setattr(settings, "database_url", url)
    monkeypatch.setattr(init_db, "engine", engine)
    monkeypatch.setattr(settings, "debug", True)
    monkeypatch.setattr(settings, "initial_admin_username", None)
    # Alembic runs in this test process: don't replace pytest's log handlers.
    monkeypatch.setattr(logging.config, "fileConfig", lambda *args, **kwargs: None)
    if legacy:
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE TABLE announcements (id INTEGER PRIMARY KEY, title VARCHAR(160), content TEXT, "
                                 "is_published BOOLEAN, created_at TIMESTAMP, updated_at TIMESTAMP, published_at TIMESTAMP)")
            conn.exec_driver_sql("INSERT INTO announcements (id, title, content) VALUES (1, 'old', 'keep')")
    try:
        assert init_db.main() == 0
        assert init_db.main() == 0  # existing versioned database
        with engine.connect() as conn:
            assert MigrationContext.configure(conn).get_current_revision() == ScriptDirectory.from_config(init_db.alembic_config()).get_current_head()
            assert "ix_announcements_visibility" in {idx["name"] for idx in inspect(conn).get_indexes("announcements")}
            if legacy:
                assert conn.execute(text("SELECT content, visibility FROM announcements WHERE id=1")).one() == ("keep", "users")
    finally:
        engine.dispose()


def test_create_schema_seeds_only_supplied_engine(monkeypatch) -> None:
    engine = create_engine("sqlite://")
    binds = []
    monkeypatch.setattr(schema, "ensure_initial_admin", lambda db: binds.append(db.get_bind()))
    schema.create_schema(engine)
    assert binds == [engine]
