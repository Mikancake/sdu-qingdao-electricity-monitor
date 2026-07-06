import smtplib
import time
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.smtp_settings import SmtpSettings


@dataclass(frozen=True)
class EmailSendResult:
    ok: bool
    error: str | None = None


@dataclass(frozen=True)
class SmtpConfig:
    host: str | None
    port: int
    username: str | None
    password: str | None
    from_email: str | None
    use_ssl: bool
    use_starttls: bool

    @property
    def configured(self) -> bool:
        return bool(self.host and self.from_email)


def load_smtp_config() -> SmtpConfig:
    config = SmtpConfig(
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
        from_email=settings.smtp_from_email,
        use_ssl=settings.smtp_use_ssl,
        use_starttls=settings.smtp_use_starttls,
    )
    try:
        with SessionLocal() as db:
            row = db.get(SmtpSettings, 1)
            if row is None:
                return config
            return SmtpConfig(
                host=row.host or config.host,
                port=row.port or config.port,
                username=row.username or config.username,
                password=row.password or config.password,
                from_email=row.from_email or config.from_email,
                use_ssl=row.use_ssl,
                use_starttls=row.use_starttls,
            )
    except SQLAlchemyError:
        return config


def smtp_configured() -> bool:
    return load_smtp_config().configured


def _send_email_once(to_email: str, subject: str, body: str) -> EmailSendResult:
    config = load_smtp_config()
    if not config.configured:
        return EmailSendResult(False, "SMTP is not configured")

    message = EmailMessage()
    message["From"] = config.from_email or ""
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        if config.use_ssl:
            with smtplib.SMTP_SSL(config.host, config.port, timeout=20) as smtp:
                _login_and_send(smtp, message, config)
        else:
            with smtplib.SMTP(config.host, config.port, timeout=20) as smtp:
                if config.use_starttls:
                    smtp.starttls()
                _login_and_send(smtp, message, config)
    except OSError as exc:
        return EmailSendResult(False, f"{type(exc).__name__}: {exc}")
    except smtplib.SMTPException as exc:
        return EmailSendResult(False, f"{type(exc).__name__}: {exc}")

    return EmailSendResult(True)


def send_email(to_email: str, subject: str, body: str, *, retries: int = 3, retry_delay_seconds: float = 2.0) -> EmailSendResult:
    attempts = max(1, retries)
    last_result = EmailSendResult(False, "email was not attempted")
    for index in range(attempts):
        last_result = _send_email_once(to_email, subject, body)
        if last_result.ok:
            return last_result
        if last_result.error == "SMTP is not configured":
            return last_result
        if index < attempts - 1 and retry_delay_seconds > 0:
            time.sleep(retry_delay_seconds)
    return last_result


def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage, config: SmtpConfig) -> None:
    if config.username and config.password:
        smtp.login(config.username, config.password)
    smtp.send_message(message)


def send_verification_code(to_email: str, code: str) -> EmailSendResult:
    subject = "\u5c71\u5927\u9752\u5c9b\u6821\u533a\u7535\u91cf\u5e73\u53f0\u9a8c\u8bc1\u7801"
    body = (
        "\u4f60\u597d\uff0c\n\n"
        f"\u4f60\u7684\u9a8c\u8bc1\u7801\u662f\uff1a{code}\n"
        "\u6709\u6548\u671f 15 \u5206\u949f\u3002\u5982\u679c\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u53ef\u4ee5\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002\n\n"
        "\u5c71\u5927\u9752\u5c9b\u6821\u533a\u7535\u91cf\u5e73\u53f0"
    )
    return send_email(to_email, subject, body)
