from app.services import emailer
from app.services.emailer import SmtpConfig


def smtp_config(*, use_ssl: bool, use_starttls: bool, username: str | None = "sender") -> SmtpConfig:
    return SmtpConfig(
        id=1,
        name="test",
        host="smtp.example.com",
        port=465 if use_ssl else 587,
        username=username,
        password="secret" if username else None,
        from_email="sender@example.com",
        use_ssl=use_ssl,
        use_starttls=use_starttls,
    )


def test_plaintext_smtp_credentials_are_refused() -> None:
    result = emailer._send_with_config(
        smtp_config(use_ssl=False, use_starttls=False),
        "recipient@example.com",
        "subject",
        "body",
    )

    assert result.ok is False
    assert result.error == "refusing to send SMTP credentials without TLS"


def test_smtp_ssl_receives_verified_tls_context(monkeypatch) -> None:
    verified_context = object()
    captured: dict[str, object] = {}

    class FakeSmtp:
        def __init__(self, host: str, port: int, *, timeout: int, context: object) -> None:
            captured.update(host=host, port=port, timeout=timeout, context=context)

        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

    monkeypatch.setattr(emailer.ssl, "create_default_context", lambda: verified_context)
    monkeypatch.setattr(emailer.smtplib, "SMTP_SSL", FakeSmtp)
    monkeypatch.setattr(emailer, "_login", lambda *_args: None)
    monkeypatch.setattr(emailer, "_send_message_data", lambda *_args: None)
    monkeypatch.setattr(emailer, "_record_smtp_health", lambda *_args, **_kwargs: None)

    result = emailer._send_with_config(
        smtp_config(use_ssl=True, use_starttls=False),
        "recipient@example.com",
        "subject",
        "body",
    )

    assert result.ok is True
    assert captured["context"] is verified_context
