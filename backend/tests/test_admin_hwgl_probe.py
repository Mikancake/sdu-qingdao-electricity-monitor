import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from types import SimpleNamespace

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.hwgl_client import HwglClientError, HwglRoomRecord
from app.models.room import Room
from app.models.admin_user import AdminUser
from app.models.hwgl_probe import HwglProbeSession
from app.schemas.admin import HwglProbeStartRequest
from app.api.routes import admin_hwgl


class FakeDirectoryClient:
    def resolve_room(self, room: Room, *, force_directory: bool = False) -> HwglRoomRecord:
        assert force_directory is True
        return HwglRoomRecord(
            campus="山东大学青岛校区",
            building=room.provider_building or "凤凰居11公寓",
            floor="2",
            display_room_number=room.room_number,
            room_key=f"meter-{room.room_number}",
            line_id="1",
        )


def _db() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_custom_probe_room_is_resolved_and_isolated(monkeypatch) -> None:
    monkeypatch.setattr(admin_hwgl, "HwglElectricityClient", FakeDirectoryClient)
    with _db() as db:
        room = admin_hwgl._resolve_custom_probe_room(
            db,
            HwglProbeStartRequest(room_number="210", building_side="11"),
        )
        db.flush()

        assert room.id is not None
        assert room.building_name == "凤凰居11/13号楼"
        assert room.provider == "hwgl"
        assert room.provider_building == "凤凰居11公寓"
        assert room.provider_room_key == "meter-210"
        assert room.probe_only is True


def test_custom_probe_room_reports_directory_errors(monkeypatch) -> None:
    class MissingRoomClient:
        def resolve_room(self, room: Room, *, force_directory: bool = False) -> HwglRoomRecord:
            raise HwglClientError("room_not_found", "not in directory")

    monkeypatch.setattr(admin_hwgl, "HwglElectricityClient", MissingRoomClient)
    with _db() as db:
        with pytest.raises(HTTPException) as error:
            admin_hwgl._resolve_custom_probe_room(
                db,
                HwglProbeStartRequest(room_number="9999999"),
            )

    assert error.value.status_code == 422
    assert "没有找到" in str(error.value.detail)


def test_probe_interval_accepts_custom_bounded_value() -> None:
    request = HwglProbeStartRequest(room_id=1, interval_seconds=900, duration_seconds=1500)

    assert request.interval_seconds == 900
    assert request.duration_seconds == 1500

    with pytest.raises(ValueError):
        HwglProbeStartRequest(room_id=1, interval_seconds=59)


def test_create_probe_flushes_new_custom_room_before_session(monkeypatch) -> None:
    monkeypatch.setattr(admin_hwgl, "HwglElectricityClient", FakeDirectoryClient)
    monkeypatch.setattr(
        admin_hwgl,
        "get_runtime_config",
        lambda db: SimpleNamespace(hwgl_probe_max_duration_seconds=7200),
    )
    with _db() as db:
        admin = AdminUser(username="admin", password_hash="hash", enabled=True)
        db.add(admin)
        db.flush()

        result = admin_hwgl.create_hwgl_probe(
            HwglProbeStartRequest(room_number="210", interval_seconds=900, duration_seconds=1500),
            admin,
            db,
        )

        session = db.get(HwglProbeSession, result.id)
        room = db.get(Room, result.room_id)
        assert session is not None
        assert room is not None
        assert session.room_id == room.id
        assert room.probe_only is True
