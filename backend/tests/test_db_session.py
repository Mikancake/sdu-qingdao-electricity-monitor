from collections.abc import Generator

import pytest

from app.db import session as session_module


class FakeSession:
    def __init__(self) -> None:
        self.rolled_back = False
        self.closed = False

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True


def open_generator(monkeypatch: pytest.MonkeyPatch) -> tuple[Generator, FakeSession]:
    fake = FakeSession()
    monkeypatch.setattr(session_module, "SessionLocal", lambda: fake)
    generator = session_module.get_db()
    assert next(generator) is fake
    return generator, fake


def test_get_db_rolls_back_after_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    generator, fake = open_generator(monkeypatch)

    with pytest.raises(RuntimeError):
        generator.throw(RuntimeError("boom"))

    assert fake.rolled_back is True
    assert fake.closed is True


def test_get_db_closes_successful_session(monkeypatch: pytest.MonkeyPatch) -> None:
    generator, fake = open_generator(monkeypatch)

    with pytest.raises(StopIteration):
        next(generator)

    assert fake.rolled_back is False
    assert fake.closed is True
