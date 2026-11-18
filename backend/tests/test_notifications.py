from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ElectricityReading, EmailDeliveryLog, Notification, Room, SmtpSettings, User, UserRoom
from app.services import emailer, notifications


@pytest.fixture
def sessions(monkeypatch, tmp_path):
    # Separate connections matter: the delivery logger is not in the batch's transaction.
    engine = create_engine(f"sqlite:///{tmp_path / 'mail.db'}", connect_args={"timeout": 0})

    @event.listens_for(engine, "connect")
    def foreign_keys(conn, _record):
        conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(notifications, "SessionLocal", factory)
    monkeypatch.setattr(emailer, "SessionLocal", factory)
    yield factory
    engine.dispose()


def test_low_power_batch_publishes_parent_before_delivery_and_honors_cooldown(sessions, monkeypatch):
    with sessions.begin() as db:
        room = Room(building_name="A & B", building_param="A", room_number="101")
        user = User(email="main@example.com", password_hash="x", is_verified=True,
                    notification_email="alerts@example.com", notification_email_verified_at=datetime.now())
        binding = UserRoom(user=user, room=room, notify_cooldown_hours=12, low_power_threshold=Decimal(10))
        reading = ElectricityReading(room=room, balance=Decimal(1), read_at=datetime.now())
        db.add_all([binding, reading, SmtpSettings(host="unused", from_email="from@example.com")])

    def transport(config, to, subject, body, *, html_body, source):
        assert source == "low_power" and to == "alerts@example.com"
        assert "A & B" in subject and "A & B" in body and "A &amp; B" in html_body
        with sessions() as log_db:
            pending = log_db.scalar(select(Notification))
            assert pending.status == "pending" and pending.reading_id == reading.id
        return emailer.EmailSendResult(True, smtp_id=config.id)

    monkeypatch.setattr(emailer, "_send_with_config", transport)
    assert notifications.run_low_power_notifications(limit=0).scanned == 0
    batch = notifications.run_low_power_notifications(limit=1)
    assert (batch.scanned, batch.sent, batch.skipped, batch.failed) == (1, 1, 0, 0)
    with sessions() as db:
        notice = db.get(Notification, batch.notifications[0])
        log = db.scalars(select(EmailDeliveryLog)).one()
        assert log.notification_id == notice.id
        assert notice.status == log.status == "sent"
        assert notice.sent_at is not None
    assert notifications.run_low_power_notifications() == notifications.NotificationBatchResult(1, 0, 1, 0)


def test_failed_warning_is_recorded_but_does_not_start_cooldown(sessions, monkeypatch):
    with sessions.begin() as db:
        room = Room(building_name="A", building_param="A", room_number="101")
        for verified, enabled in [(True, True), (True, False), (False, True)]:
            user = User(email=f"{verified}-{enabled}@example.com", password_hash="x", is_verified=verified)
            db.add(UserRoom(user=user, room=room, enabled=enabled, notify_cooldown_hours=12,
                            low_power_threshold=Decimal(10)))
        db.add(ElectricityReading(room=room, balance=Decimal(1), read_at=datetime.now()))

    results = iter([emailer.EmailSendResult(False, "not accepted"), emailer.EmailSendResult(True)])
    monkeypatch.setattr(notifications, "send_email", lambda *_args, **_kwargs: next(results))
    failed = notifications.run_low_power_notifications()
    assert (failed.scanned, failed.failed, failed.skipped) == (2, 1, 1)
    with sessions() as db:
        notice = db.get(Notification, failed.notifications[0])
        assert (notice.status, notice.sent_at, notice.error_msg) == ("error", None, "not accepted")
    assert notifications.run_low_power_notifications().sent == 1


def test_daily_report_retries_only_unsent_verified_recipients(sessions, monkeypatch):
    with sessions.begin() as db:
        for name in ["sent", "failed", "disabled", "unverified"]:
            db.add(User(email=f"{name}@example.com", password_hash="x", is_verified=name != "unverified",
                        daily_report_enabled=name != "disabled", daily_report_interval_days=2))
    recipients = []

    def deliver(to, subject, text, *, html_body, source):
        assert source == "daily_report" and "用电日报" in subject and "还没有绑定宿舍" in html_body
        recipients.append(to)
        return emailer.EmailSendResult(to != "failed@example.com" or recipients.count(to) > 1)

    monkeypatch.setattr(notifications, "send_email", deliver)
    assert notifications.run_daily_reports() == notifications.DailyReportBatchResult(3, 1, 1, 1)
    assert notifications.run_daily_reports() == notifications.DailyReportBatchResult(3, 1, 2, 0)
    assert recipients == ["sent@example.com", "failed@example.com", "failed@example.com"]


def test_daily_report_due_uses_supplied_time_in_last_sent_zone():
    zone = timezone(timedelta(hours=8))
    user = User(daily_report_enabled=True, daily_report_interval_days=2,
                daily_report_last_sent_at=datetime(2025, 7, 10, 8, tzinfo=zone))
    assert not notifications._daily_report_due(user, datetime(2025, 7, 11, 15, 59, tzinfo=timezone.utc))
    assert notifications._daily_report_due(user, datetime(2025, 7, 11, 16, tzinfo=timezone.utc))


def test_test_email_uses_verified_recipient_and_only_enabled_bindings(sessions, monkeypatch):
    deliveries = []

    def deliver(to, subject, body, *, html_body, source):
        assert source == "user_test" and "测试邮件" in subject
        assert "Active" in body and "Disabled" not in html_body
        deliveries.append(to)
        return emailer.EmailSendResult(True)

    monkeypatch.setattr(notifications, "send_email", deliver)
    with sessions.begin() as db:
        user = User(email="main@example.com", password_hash="x", is_verified=True,
                    notification_email="alternate@example.com")
        for name in ["Active", "Disabled"]:
            room = Room(building_name=name, building_param=name, room_number="101")
            db.add(UserRoom(user=user, room=room, enabled=name == "Active"))
        db.flush()
        assert notifications.send_test_email_for_user(db, user).ok
        user.notification_email_verified_at = datetime.now()
        assert notifications.send_test_email_for_user(db, user).ok
    assert deliveries == ["main@example.com", "alternate@example.com"]
