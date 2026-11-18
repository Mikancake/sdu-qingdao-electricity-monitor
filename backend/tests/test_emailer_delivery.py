import smtplib
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import SmtpSettings
from app.services import emailer


def config(account=1, **kwargs):
    return replace(emailer.SmtpConfig(account, f"smtp-{account}", "unused", 587, "sender", "secret",
                                     "sender@example.com", False, True), **kwargs)


@pytest.mark.parametrize(("first_data", "quit_error", "attempts", "unknown"), [
    (smtplib.SMTPDataError(554, b"DATA refused"), None, 2, False),
    ((554, b"message rejected"), None, 2, False),
    (smtplib.SMTPServerDisconnected("no final reply"), None, 1, True),
    ((250, b"accepted"), smtplib.SMTPResponseException(421, b"closing"), 1, False),
])
def test_smtp_fails_over_only_before_acceptance(monkeypatch, first_data, quit_error, attempts, unknown):
    servers = []
    for account in (1, 2):
        smtp = Mock(spec=smtplib.SMTP)
        smtp.mail.return_value = (250, b"ok")
        smtp.rcpt.return_value = (251, b"forwarded")
        smtp.data.side_effect = [first_data if account == 1 else (250, b"accepted")]
        smtp.quit.side_effect = quit_error
        servers.append(smtp)
    monkeypatch.setattr(emailer.smtplib, "SMTP", Mock(side_effect=servers))
    monkeypatch.setattr(emailer.smtplib, "SMTP_SSL", Mock(side_effect=AssertionError("unexpected implicit TLS")))
    monkeypatch.setattr(emailer.ssl, "create_default_context", lambda: "test-context")
    monkeypatch.setattr(emailer, "load_smtp_configs", lambda **_: [config(2), config(1)])
    health, delivery = Mock(), Mock()
    monkeypatch.setattr(emailer, "_record_smtp_health", health)
    monkeypatch.setattr(emailer, "_record_email_delivery", delivery)

    result = emailer.send_email("to@example.com", "subject", "plain", html_body="<p>html</p>",
                                retries=1, source="low_power", notification_id=44)
    assert result.ok and result.smtp_id == attempts
    assert (result.error is not None) == unknown
    assert health.call_count == attempts
    assert health.call_args_list[0].kwargs.get("error_kind") == (
        "smtp" if attempts == 2 else "delivery_unknown" if unknown else None
    )
    delivery.assert_called_once_with(result, source="low_power", recipient_email="to@example.com",
                                     subject="subject", notification_id=44)
    for smtp in servers[:attempts]:
        smtp.starttls.assert_called_once_with(context="test-context")
        smtp.login.assert_called_once_with("sender", "secret")
        smtp.rcpt.assert_called_once_with("to@example.com")
        smtp.close.assert_called_once_with()
        msg = BytesParser(policy=policy.default).parsebytes(smtp.data.call_args.args[0])
        assert msg.get_body(preferencelist=("plain",)).get_content().strip() == "plain"
        assert msg.get_body(preferencelist=("html",)).get_content().strip() == "<p>html</p>"
    for smtp in servers[attempts:]:
        smtp.data.assert_not_called()


def test_retry_after_account_disabled_preserves_original_error(monkeypatch):
    failed = emailer.EmailSendResult(False, "authentication failed", smtp_id=1)
    monkeypatch.setattr(emailer, "load_smtp_configs", Mock(side_effect=[[config()], []]))
    monkeypatch.setattr(emailer, "_send_with_config", Mock(return_value=failed))
    delivery = Mock()
    monkeypatch.setattr(emailer, "_record_email_delivery", delivery)
    assert emailer.send_email("to@example.com", "test", "body", retry_delay_seconds=0) == failed
    assert delivery.call_args.args == (failed,)


def test_cooldown_uses_reference_instant():
    now = datetime(2025, 3, 1, 12, tzinfo=timezone.utc)
    local = timezone(timedelta(hours=8))
    account = config(last_used_at=now.astimezone(local), min_interval_seconds=60)
    assert not emailer._is_available(account, now + timedelta(seconds=59))
    assert emailer._is_available(account, now + timedelta(seconds=60))


def test_env_fallback_only_when_no_accounts_exist(monkeypatch):
    engine = create_engine("sqlite://")
    SmtpSettings.__table__.create(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(emailer, "SessionLocal", factory)
    env = config(account=None)
    monkeypatch.setattr(emailer, "_env_smtp_config", lambda: env)
    assert emailer.load_smtp_configs() == [env]
    with factory.begin() as db:
        db.add(SmtpSettings(enabled=False, host="unused", from_email="from@example.com"))
    assert emailer.load_smtp_configs() == []
    assert not emailer.smtp_configured()
    assert not emailer.load_smtp_configs(include_disabled=True)[0].enabled
    assert emailer.load_smtp_configs(smtp_id=999) == []
