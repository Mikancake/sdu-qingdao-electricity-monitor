from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.deps import db_session
from app.api.routes import me
from app.core.config import settings
from app.core.security import sign_access_token
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.models import (
    AdminUser, AppSetting, CheckAttempt, ElectricityReading, EmailVerificationCode, Room, User, UserRoom,
)
from app.services.electricity_queries import ElectricityQueryExecution


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "debug", True)
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    from app.main import create_app

    engine = create_engine(f"sqlite:///{tmp_path / 'test.sqlite3'}", connect_args={"timeout": 0.2})
    sessions = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with sessions.begin() as db:
        member = User(email="member@example.com", password_hash="fixture-member", is_verified=True)
        admin = AdminUser(username="admin", password_hash="fixture-admin", enabled=True)
        db.add_all([member, admin])
        db.flush()
        headers = {"Authorization": "Bearer " + sign_access_token(member.id, password_hash=member.password_hash)}
        admin_headers = {
            "Authorization": "Bearer " + sign_access_token(admin.id, kind="admin", password_hash=admin.password_hash)
        }

    def isolated_session():
        with sessions() as session:
            yield session

    app = create_app()
    app.dependency_overrides[db_session] = isolated_session
    try:
        with TestClient(app, base_url="http://localhost") as client:
            yield client, sessions, headers, admin_headers
    finally:
        engine.dispose()


def test_mounts_role_contract_and_validation_shape(api):
    client, _, member, admin = api
    paths = client.app.openapi()["paths"]
    assert "/api/rooms" not in paths
    assert all(not path.startswith("/api/rooms/") for path in paths)
    assert {"/health", "/api/buildings", "/api/appearance", "/api/announcements"} <= paths.keys()
    for path, methods in paths.items():
        if path.startswith(("/api/me/", "/api/admin/")) and path != "/api/admin/auth/login":
            assert all(operation.get("security") for operation in methods.values()), path
    assert client.get("/api/auth/me", headers=member).json()["email"] == "member@example.com"
    assert client.get("/api/admin/auth/me", headers=admin).json()["username"] == "admin"
    assert client.get("/api/me/rooms").status_code == 401
    assert client.get("/api/admin/users/page", headers=member).status_code == 401

    # Missing email is an ordinary incomplete form. Error metadata suffices;
    # the rest of the submitted form must not accompany it in the response.
    response = client.post("/api/auth/request-verification-code", json={"password": "fixture-password"})
    assert response.status_code == 422
    error, = response.json()["detail"]
    assert set(error) == {"loc", "msg", "type"}
    assert error["loc"] == ["body", "email"]
    assert "fixture-password" not in response.text
    assert paths["/api/auth/request-verification-code"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/UserCreate"
    }


def test_check_history_is_scoped_before_limit(api):
    client, sessions, headers, _ = api
    with sessions.begin() as db:
        member = db.scalar(select(User))
        roommate = User(email="roommate@example.com", password_hash="hash", is_verified=True)
        shared = Room(building_name="Dorm", building_param="Dorm", room_number="101")
        other = Room(building_name="Dorm", building_param="Dorm", room_number="102")
        db.add_all([roommate, shared, other])
        db.flush()
        mine, theirs = (UserRoom(user_id=owner.id, room_id=shared.id) for owner in (member, roommate))
        db.add_all([mine, theirs])
        db.flush()
        when = datetime.now()
        records = [
            CheckAttempt(room_id=shared.id, source="worker", started_at=when),
            CheckAttempt(room_id=shared.id, source="user", user_id=member.id, user_room_id=mine.id, started_at=when),
            CheckAttempt(room_id=shared.id, source="user", user_id=roommate.id, user_room_id=theirs.id, started_at=when),
            CheckAttempt(room_id=other.id, source="worker", started_at=when),
        ]
        db.add_all(records)
        db.flush()
        expected = [records[1].id, records[0].id]
    response = client.get("/api/me/check-attempts?limit=2", headers=headers)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == expected


def test_room_binding_and_update_use_normalized_location(api, monkeypatch):
    client, sessions, headers, _ = api
    sources, limits = [], []
    monkeypatch.setattr(me, "enforce_room_validation_limit", lambda _, user: limits.append(user.id))

    def execute(room, *, source):
        # Simulate the separate DB session used by token reservation; no
        # network, token pool or production database is involved.
        with sessions.begin() as db:
            db.add(AppSetting(key=f"observed_{source}", value=room.room_number))
        sources.append(source)
        return ElectricityQueryExecution(ElectricityQueryResult(True, balance=Decimal("12.34")))

    monkeypatch.setattr(me, "execute_room_query", execute)
    response = client.post("/api/me/rooms", headers=headers, json={
        "building_param": "test-dorm", "building_name": "Test Dorm", "room_number": "B101",
    })
    assert response.status_code == 201
    first = response.json()
    path = f"/api/me/rooms/{first['id']}"
    assert client.patch(path, headers=headers, json={"room_number": " B101 ", "alert_days": 3}).json()["alert_days"] == 3
    updated = client.patch(path, headers=headers, json={"room_number": "B102"})
    assert updated.status_code == 200
    assert updated.json()["room"]["room_number"] == "b102"
    assert updated.json()["room_id"] == updated.json()["room"]["id"] != first["room_id"]
    assert sources == ["bind", "room_update"]
    assert len(limits) == 2
    with sessions() as db:
        assert list(db.scalars(select(ElectricityReading.source).order_by(ElectricityReading.id))) == sources


def test_notification_code_is_bound_to_requester_with_recipient_wide_cooldown(api, monkeypatch):
    client, sessions, headers, _ = api
    recipient = "reminders@example.com"
    sent = []
    monkeypatch.setattr(me, "enforce_rate_limit", lambda *args, **kwargs: None)

    def deliver(address, code):
        sent.append((address, code))
        return True

    monkeypatch.setattr(me, "deliver_verification_code", deliver)
    base = "/api/me/notification-email"
    assert client.post(f"{base}/request-code", headers=headers, json={"email": recipient}).status_code == 200
    with sessions() as db:
        member = db.scalar(select(User))
        challenge = db.scalar(select(EmailVerificationCode))
        other = User(id=member.id + 1, password_hash="other")
        assert challenge.purpose == me.notification_code_purpose(member) != me.notification_code_purpose(other)
    again = client.post(f"{base}/request-code", headers=headers, json={"email": recipient})
    assert again.status_code == 429
    assert again.json()["detail"]["kind"] == "verification_email_cooldown"
    (address, code), = sent
    verified = client.post(f"{base}/verify", headers=headers, json={"email": address, "code": code})
    assert verified.status_code == 200
    assert verified.json()["notification_email_verified"] is True
    with sessions() as db:
        assert db.scalar(select(EmailVerificationCode.consumed_at)) is not None


def test_notification_address_and_preferences_preserve_omitted_state(api):
    client, sessions, headers, admin = api
    with sessions.begin() as db:
        member = db.scalar(select(User))
        member.notification_email = "notify@example.com"
        member.notification_email_verified_at = datetime.now()
        path = f"/api/admin/users/{member.id}"
    same = client.patch(path, headers=admin, json={"notification_email": " NOTIFY@EXAMPLE.COM "})
    assert same.status_code == 200
    assert same.json()["notification_email_verified"] is True
    changed = client.patch(path, headers=admin, json={"notification_email": "new@example.com"})
    assert changed.json()["notification_email_verified"] is False
    result = client.patch("/api/me/preferences", headers=headers, json={"daily_report_enabled": None})
    assert result.status_code == 200
    assert result.json()["daily_report_enabled"] is True
    disabled = client.patch("/api/me/preferences", headers=headers, json={"daily_report_enabled": False})
    assert disabled.json()["daily_report_enabled"] is False


def test_upload_serves_only_processed_assets_and_preserves_referenced_file(api, monkeypatch):
    from app.api.routes import admin_appearance

    client, _, _, admin = api
    public_root = Path(settings.upload_dir).resolve()
    optimize = admin_appearance.build_optimized_background

    def optimize_staged_image(source, destination):
        assert public_root not in source.resolve().parents
        optimize(source, destination)

    monkeypatch.setattr(admin_appearance, "build_optimized_background", optimize_staged_image)
    image = BytesIO()
    Image.new("RGB", (12, 8)).save(image, format="PNG")
    upload = client.post("/api/admin/appearance/background", headers=admin, files={
        "file": ("example.png", image.getvalue(), "image/png"),
    })
    assert upload.status_code == 200
    url = upload.json()["url"]
    assert {path.name for path in (public_root / "appearance").iterdir()} == {
        Path(url).name, Path(upload.json()["blurred_url"]).name,
    }
    for value in (url, url + "?v=2"):
        response = client.patch("/api/admin/appearance", headers=admin, json={"light_background_image_url": value})
        assert response.status_code == 200
        assert client.get(value).headers["content-type"] == "image/webp"
    cleared = client.patch("/api/admin/appearance", headers=admin, json={"light_background_image_url": None})
    assert cleared.status_code == 200
    assert not (public_root / "appearance" / Path(url).name).exists()


def test_resource_id_validation_distinguishes_invalid_and_absent(api):
    client, _, _, admin = api
    for invalid_id in (0, 2**63):
        response = client.get(f"/api/admin/users/{invalid_id}", headers=admin)
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["path", "user_id"]
    assert client.get("/api/admin/users/12345", headers=admin).status_code == 404


def test_binding_rolls_back_when_last_slot_is_filled_during_room_validation(api, monkeypatch):
    client, sessions, headers, _ = api
    with sessions.begin() as db:
        db.add(AppSetting(key="max_rooms_per_user", value="1"))
        db.add(Room(building_name="Dorm", building_param="Dorm", room_number="101"))

    def finish_other_binding(room, *, source):
        with sessions.begin() as db:
            db.add(UserRoom(user_id=db.scalar(select(User.id)), room_id=db.scalar(select(Room.id))))
        return ElectricityQueryExecution(ElectricityQueryResult(True, balance=Decimal("12")))

    monkeypatch.setattr(me, "enforce_room_validation_limit", lambda *args: None)
    monkeypatch.setattr(me, "execute_room_query", finish_other_binding)
    response = client.post("/api/me/rooms", headers=headers, json={
        "building_param": "Dorm", "building_name": "Dorm", "room_number": "102",
    })
    assert response.status_code == 422
    assert response.json()["detail"]["kind"] == "room_bind_limit"
    with sessions() as db:
        assert list(db.scalars(select(Room.room_number))) == ["101"]
        assert len(db.scalars(select(UserRoom.id)).all()) == 1
        assert db.scalar(select(ElectricityReading.id)) is None
