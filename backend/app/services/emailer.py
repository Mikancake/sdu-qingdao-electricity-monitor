import smtplib
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.smtp_health_log import SmtpHealthLog
from app.models.smtp_settings import SmtpSettings


SMTP_AUTH_FAILURE_LIMIT = 3


@dataclass(frozen=True)
class EmailSendResult:
    ok: bool
    error: str | None = None
    smtp_id: int | None = None
    smtp_name: str | None = None


@dataclass(frozen=True)
class SmtpConfig:
    id: int | None
    name: str
    host: str | None
    port: int
    username: str | None
    password: str | None
    from_email: str | None
    use_ssl: bool
    use_starttls: bool
    enabled: bool = True
    min_interval_seconds: int = 0
    last_used_at: datetime | None = None
    health_status: str = "unknown"

    @property
    def configured(self) -> bool:
        return bool(self.host and self.from_email)


def _env_smtp_config() -> SmtpConfig:
    return SmtpConfig(
        id=None,
        name="env",
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
        from_email=settings.smtp_from_email,
        use_ssl=settings.smtp_use_ssl,
        use_starttls=settings.smtp_use_starttls,
    )


def _smtp_config_from_row(row: SmtpSettings) -> SmtpConfig:
    return SmtpConfig(
        id=row.id,
        name=row.name or f"smtp-{row.id}",
        host=row.host,
        port=row.port,
        username=row.username,
        password=row.password,
        from_email=row.from_email,
        use_ssl=row.use_ssl,
        use_starttls=row.use_starttls,
        enabled=row.enabled,
        min_interval_seconds=row.min_interval_seconds or 0,
        last_used_at=row.last_used_at,
        health_status=row.health_status or "unknown",
    )


def load_smtp_configs(*, include_disabled: bool = False, smtp_id: int | None = None) -> list[SmtpConfig]:
    try:
        with SessionLocal() as db:
            stmt = select(SmtpSettings).order_by(SmtpSettings.id)
            if smtp_id is not None:
                stmt = stmt.where(SmtpSettings.id == smtp_id)
            rows = list(db.scalars(stmt))
            configs = [_smtp_config_from_row(row) for row in rows if include_disabled or row.enabled]
            if configs:
                return configs
    except SQLAlchemyError:
        pass

    if smtp_id is not None:
        return []
    return [_env_smtp_config()]


def load_smtp_config() -> SmtpConfig:
    configs = load_smtp_configs()
    for config in configs:
        if config.configured and config.enabled:
            return config
    return configs[0] if configs else _env_smtp_config()


def smtp_configured() -> bool:
    return any(config.configured and config.enabled for config in load_smtp_configs())


def _now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


def _is_available(config: SmtpConfig, now: datetime) -> bool:
    if not config.enabled or not config.configured:
        return False
    if config.id is None or config.min_interval_seconds <= 0 or config.last_used_at is None:
        return True
    return config.last_used_at + timedelta(seconds=config.min_interval_seconds) <= _now_like(config.last_used_at)


def _ordered_available_configs(configs: list[SmtpConfig]) -> list[SmtpConfig]:
    now = datetime.now()
    available = [config for config in configs if _is_available(config, now)]
    return sorted(available, key=lambda item: (item.last_used_at is not None, item.last_used_at or datetime.min, item.id or 0))


def _classify_smtp_error(exc: BaseException) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "auth"
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "recipient"
    if isinstance(exc, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError, OSError)):
        return "network"
    return "smtp"


def _record_smtp_health(
    config: SmtpConfig,
    *,
    success: bool,
    source: str,
    recipient_email: str,
    error_kind: str | None = None,
    error_msg: str | None = None,
) -> None:
    if config.id is None:
        return

    try:
        with SessionLocal() as db:
            row = db.get(SmtpSettings, config.id)
            if row is None:
                return

            checked_at = datetime.now()
            row.last_used_at = checked_at
            row.last_checked_at = checked_at
            if success:
                row.health_status = "healthy"
                row.failure_count = 0
                row.last_success_at = checked_at
                row.last_error_kind = None
                row.last_error_msg = None
            else:
                row.last_error_at = checked_at
                row.last_error_kind = error_kind
                row.last_error_msg = error_msg
                if error_kind != "recipient":
                    row.failure_count = (row.failure_count or 0) + 1
                    row.health_status = "invalid" if error_kind == "auth" and row.failure_count >= SMTP_AUTH_FAILURE_LIMIT else "warning"
                    if error_kind == "auth" and row.failure_count >= SMTP_AUTH_FAILURE_LIMIT:
                        row.enabled = False

            db.add(
                SmtpHealthLog(
                    smtp_settings_id=row.id,
                    source=source,
                    recipient_email=recipient_email,
                    success=success,
                    error_kind=error_kind,
                    error_msg=error_msg,
                    health_status=row.health_status,
                    failure_count=row.failure_count or 0,
                )
            )
            db.commit()
    except SQLAlchemyError:
        return


def _record_email_delivery(
    result: EmailSendResult,
    *,
    source: str,
    recipient_email: str,
    subject: str,
    notification_id: int | None = None,
) -> None:
    try:
        with SessionLocal() as db:
            db.add(
                EmailDeliveryLog(
                    smtp_settings_id=result.smtp_id,
                    notification_id=notification_id,
                    source=source,
                    recipient_email=recipient_email,
                    subject=subject[:255],
                    status="sent" if result.ok else "error",
                    error_msg=result.error,
                    sent_at=datetime.now() if result.ok else None,
                )
            )
            db.commit()
    except SQLAlchemyError:
        return


def _build_message(to_email: str, subject: str, body: str, config: SmtpConfig, *, html_body: str | None = None) -> EmailMessage:
    message = EmailMessage()
    message["From"] = config.from_email or ""
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    return message


def _send_with_config(
    config: SmtpConfig,
    to_email: str,
    subject: str,
    body: str,
    *,
    html_body: str | None = None,
    source: str = "send",
) -> EmailSendResult:
    if not config.configured:
        return EmailSendResult(False, "SMTP is not configured", smtp_id=config.id, smtp_name=config.name)

    message = _build_message(to_email, subject, body, config, html_body=html_body)
    try:
        if config.use_ssl:
            with smtplib.SMTP_SSL(config.host, config.port, timeout=20) as smtp:
                _login_and_send(smtp, message, config)
        else:
            with smtplib.SMTP(config.host, config.port, timeout=20) as smtp:
                if config.use_starttls:
                    smtp.starttls()
                _login_and_send(smtp, message, config)
    except (OSError, smtplib.SMTPException) as exc:
        error_kind = _classify_smtp_error(exc)
        error = f"{type(exc).__name__}: {exc}"
        _record_smtp_health(config, success=False, source=source, recipient_email=to_email, error_kind=error_kind, error_msg=error)
        return EmailSendResult(False, error, smtp_id=config.id, smtp_name=config.name)

    _record_smtp_health(config, success=True, source=source, recipient_email=to_email)
    return EmailSendResult(True, smtp_id=config.id, smtp_name=config.name)


def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    html_body: str | None = None,
    retries: int = 3,
    retry_delay_seconds: float = 2.0,
    smtp_id: int | None = None,
    source: str = "send",
    notification_id: int | None = None,
) -> EmailSendResult:
    attempts = max(1, retries)
    last_result = EmailSendResult(False, "email was not attempted")

    for index in range(attempts):
        configs = _ordered_available_configs(load_smtp_configs(smtp_id=smtp_id))
        if not configs:
            last_result = EmailSendResult(False, "SMTP is not configured or all SMTP accounts are cooling down")
            _record_email_delivery(last_result, source=source, recipient_email=to_email, subject=subject, notification_id=notification_id)
            return last_result

        for config in configs:
            last_result = _send_with_config(config, to_email, subject, body, html_body=html_body, source=source)
            if last_result.ok:
                _record_email_delivery(last_result, source=source, recipient_email=to_email, subject=subject, notification_id=notification_id)
                return last_result
            if last_result.error == "SMTP is not configured":
                continue

        if index < attempts - 1 and retry_delay_seconds > 0:
            time.sleep(retry_delay_seconds)

    _record_email_delivery(last_result, source=source, recipient_email=to_email, subject=subject, notification_id=notification_id)
    return last_result


def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage, config: SmtpConfig) -> None:
    if config.username and config.password:
        smtp.login(config.username, config.password)
    smtp.send_message(message)


def send_verification_code(to_email: str, code: str) -> EmailSendResult:
    subject = "Electricity Monitor 验证码"
    body = (
        "你好，\n\n"
        f"你的验证码是：{code}\n"
        "有效期 15 分钟。如果不是你本人操作，可以忽略这封邮件。\n\n"
        "Electricity Monitor"
    )
    html_body = f"""<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033;">
    <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid #e4e8f0;border-radius:18px;background:#ffffff;padding:28px;box-shadow:0 18px 45px rgba(23,32,51,.08);">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#667085;">Electricity Monitor</div>
        <h1 style="margin:12px 0 8px;font-size:24px;line-height:1.25;color:#111827;">邮箱验证码</h1>
        <p style="margin:0 0 18px;color:#667085;line-height:1.7;">请在 15 分钟内输入下面的验证码完成验证。</p>
        <div style="display:inline-block;padding:14px 22px;border-radius:14px;background:#111827;color:#ffffff;font-size:30px;font-weight:700;letter-spacing:.28em;">{code}</div>
        <p style="margin:22px 0 0;color:#667085;font-size:13px;line-height:1.7;">如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    </div>
  </body>
</html>"""
    return send_email(to_email, subject, body, html_body=html_body, source="verification")
