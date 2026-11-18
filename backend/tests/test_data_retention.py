from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.hwgl_probe import HwglProbeSample, HwglProbeSession
from app.models.notification import Notification
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services import data_retention
from app.services.runtime_settings import RuntimeConfig


@pytest.mark.parametrize("enforce_fks", [False, True])
def test_retention_keeps_references_and_probe_reports_consistent(monkeypatch, enforce_fks) -> None:
    now = datetime(2026, 9, 10, 12, tzinfo=timezone.utc)
    cutoff = now - timedelta(days=1)
    old = cutoff - timedelta(seconds=1)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    monkeypatch.setattr(data_retention, "datetime", Clock)
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql(f"PRAGMA foreign_keys={int(enforce_fks)}")
        Base.metadata.create_all(conn)
    with Session(engine) as db:
        room = Room(building_name="test", building_param="test", room_number="101")
        user = User(email="test@example.com", password_hash="test")
        binding = UserRoom(room=room, user=user)
        db.add(binding)
        db.flush()
        notification = Notification(room_id=room.id, user_id=user.id, user_room_id=binding.id,
                                    recipient_email=user.email, subject="test", body="test", created_at=old)
        db.add(notification)
        db.flush()
        db.add(EmailDeliveryLog(notification_id=notification.id, created_at=cutoff, status="sent"))
        for session_id, status, finished in [(1, "finished", old), (2, "stopped", cutoff), (3, "running", None)]:
            probe = HwglProbeSession(id=session_id, room=room, status=status, created_at=old, finished_at=finished,
                                     sample_count=1)
            probe.samples.append(HwglProbeSample(room_id=room.id, requested_at=old, received_at=old, created_at=old))
            db.add(probe)
        db.commit()

    policy = RuntimeConfig(notification_retention_days=1, scheduled_job_run_retention_days=1)
    with Session(engine) as db:
        disabled = RuntimeConfig(notification_retention_days=0, scheduled_job_run_retention_days=0)
        assert data_retention.cleanup_data_retention(db, disabled).total_deleted == 0
        result = data_retention.cleanup_data_retention(db, policy)
        assert result.notifications_deleted == 1
        assert result.email_delivery_logs_deleted == 0
        assert result.hwgl_probe_sessions_deleted == result.hwgl_probe_samples_deleted == 1
        assert result.total_deleted == 3
        log = db.scalars(select(EmailDeliveryLog)).one()
        assert log.notification_id is None
        assert list(db.scalars(select(HwglProbeSession.id).order_by(HwglProbeSession.id))) == [2, 3]
        assert list(db.scalars(select(HwglProbeSample.session_id).order_by(HwglProbeSample.session_id))) == [2, 3]
        assert data_retention.cleanup_data_retention(db, policy).total_deleted == 0
