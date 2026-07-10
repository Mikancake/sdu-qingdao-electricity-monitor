from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.smtp_settings import SmtpSettings
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import AdminStatusOut
from app.services.emailer import smtp_configured


def _count(value: int | None) -> int:
    return int(value or 0)


def build_admin_status(db: Session) -> AdminStatusOut:
    recent_cutoff = datetime.now() - timedelta(hours=24)

    token_count, enabled_token_count, unhealthy_token_count = db.execute(
        select(
            func.count(AuthToken.id),
            func.count(AuthToken.id).filter(AuthToken.enabled.is_(True)),
            func.count(AuthToken.id).filter(AuthToken.health_status.in_(["warning", "invalid"])),
        )
    ).one()
    smtp_count, enabled_smtp_count, unhealthy_smtp_count = db.execute(
        select(
            func.count(SmtpSettings.id),
            func.count(SmtpSettings.id).filter(SmtpSettings.enabled.is_(True)),
            func.count(SmtpSettings.id).filter(SmtpSettings.health_status.in_(["warning", "invalid"])),
        )
    ).one()
    (
        pending_notifications,
        failed_notifications,
        sent_notifications,
        total_notifications,
        recent_sent_notifications,
        recent_failed_notifications,
    ) = db.execute(
        select(
            func.count(Notification.id).filter(Notification.status == "pending"),
            func.count(Notification.id).filter(Notification.status == "error"),
            func.count(Notification.id).filter(Notification.status == "sent"),
            func.count(Notification.id),
            func.count(Notification.id).filter(Notification.status == "sent", Notification.sent_at >= recent_cutoff),
            func.count(Notification.id).filter(Notification.status == "error", Notification.created_at >= recent_cutoff),
        )
    ).one()
    (
        daily_report_emails,
        total_daily_report_emails,
        recent_daily_report_emails,
        recent_failed_daily_report_emails,
        all_sent_emails,
        all_total_emails,
        recent_sent_emails,
        recent_failed_emails,
    ) = db.execute(
        select(
            func.count(EmailDeliveryLog.id).filter(
                EmailDeliveryLog.source == "daily_report", EmailDeliveryLog.status == "sent"
            ),
            func.count(EmailDeliveryLog.id).filter(EmailDeliveryLog.source == "daily_report"),
            func.count(EmailDeliveryLog.id).filter(
                EmailDeliveryLog.source == "daily_report",
                EmailDeliveryLog.status == "sent",
                EmailDeliveryLog.sent_at >= recent_cutoff,
            ),
            func.count(EmailDeliveryLog.id).filter(
                EmailDeliveryLog.source == "daily_report",
                EmailDeliveryLog.status == "error",
                EmailDeliveryLog.created_at >= recent_cutoff,
            ),
            func.count(EmailDeliveryLog.id).filter(EmailDeliveryLog.status == "sent"),
            func.count(EmailDeliveryLog.id),
            func.count(EmailDeliveryLog.id).filter(
                EmailDeliveryLog.status == "sent", EmailDeliveryLog.sent_at >= recent_cutoff
            ),
            func.count(EmailDeliveryLog.id).filter(
                EmailDeliveryLog.status == "error", EmailDeliveryLog.created_at >= recent_cutoff
            ),
        )
    ).one()
    total_rooms, active_bindings = db.execute(
        select(
            func.count(func.distinct(UserRoom.room_id)),
            func.count(UserRoom.id).filter(UserRoom.enabled.is_(True)),
        )
    ).one()
    total_users, verified_users = db.execute(
        select(
            func.count(User.id),
            func.count(User.id).filter(User.is_verified.is_(True)),
        )
    ).one()
    latest_read_at = db.scalar(select(ElectricityReading.read_at).order_by(ElectricityReading.read_at.desc()).limit(1))

    return AdminStatusOut(
        token_count=_count(token_count),
        enabled_token_count=_count(enabled_token_count),
        unhealthy_token_count=_count(unhealthy_token_count),
        smtp_count=_count(smtp_count),
        enabled_smtp_count=_count(enabled_smtp_count),
        unhealthy_smtp_count=_count(unhealthy_smtp_count),
        smtp_configured=smtp_configured(),
        pending_notifications=_count(pending_notifications),
        failed_notifications=_count(failed_notifications),
        sent_notifications=_count(sent_notifications) + _count(daily_report_emails),
        total_notifications=_count(total_notifications) + _count(total_daily_report_emails),
        recent_sent_notifications=_count(recent_sent_notifications) + _count(recent_daily_report_emails),
        recent_failed_notifications=_count(recent_failed_notifications) + _count(recent_failed_daily_report_emails),
        all_sent_emails=_count(all_sent_emails),
        all_total_emails=_count(all_total_emails),
        recent_sent_emails=_count(recent_sent_emails),
        recent_failed_emails=_count(recent_failed_emails),
        active_bindings=_count(active_bindings),
        verified_users=_count(verified_users),
        total_rooms=_count(total_rooms),
        total_users=_count(total_users),
        latest_read_at=latest_read_at,
    )
