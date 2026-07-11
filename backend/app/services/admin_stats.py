from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken
from app.models.check_attempt import CheckAttempt
from app.models.email_delivery_log import EmailDeliveryLog
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.room import Room
from app.models.smtp_settings import SmtpSettings
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import AdminActivityPoint, AdminBuildingStat, AdminStatusOut
from app.services.emailer import smtp_configured


def _count(value: int | None) -> int:
    return int(value or 0)


def _daily_count_map(db: Session, timestamp_column, cutoff: datetime, *criteria) -> dict[str, int]:
    day_expression = func.date(timestamp_column)
    rows = db.execute(
        select(day_expression, func.count()).where(timestamp_column >= cutoff, *criteria).group_by(day_expression)
    )
    return {str(day): _count(count) for day, count in rows}


def _build_activity_series(db: Session, *, today: date | None = None) -> list[AdminActivityPoint]:
    end_day = today or datetime.now().date()
    days = [end_day - timedelta(days=offset) for offset in range(6, -1, -1)]
    cutoff = datetime.combine(days[0], datetime.min.time())
    readings = _daily_count_map(db, ElectricityReading.read_at, cutoff)
    emails = _daily_count_map(
        db,
        EmailDeliveryLog.sent_at,
        cutoff,
        EmailDeliveryLog.status == "sent",
        EmailDeliveryLog.sent_at.is_not(None),
    )
    failed_emails = _daily_count_map(
        db,
        EmailDeliveryLog.created_at,
        cutoff,
        EmailDeliveryLog.status == "error",
    )
    users = _daily_count_map(db, User.created_at, cutoff)
    successful_checks = _daily_count_map(
        db,
        CheckAttempt.started_at,
        cutoff,
        CheckAttempt.success.is_(True),
    )
    failed_checks = _daily_count_map(
        db,
        CheckAttempt.started_at,
        cutoff,
        CheckAttempt.success.is_(False),
    )
    return [
        AdminActivityPoint(
            day=day,
            readings=readings.get(day.isoformat(), 0),
            emails_sent=emails.get(day.isoformat(), 0),
            emails_failed=failed_emails.get(day.isoformat(), 0),
            checks_succeeded=successful_checks.get(day.isoformat(), 0),
            checks_failed=failed_checks.get(day.isoformat(), 0),
            new_users=users.get(day.isoformat(), 0),
        )
        for day in days
    ]


def _build_building_stats(db: Session) -> list[AdminBuildingStat]:
    group_columns = (Room.campus, Room.building_key, Room.building_name, Room.building_param)
    binding_rows = db.execute(
        select(
            *group_columns,
            func.count(func.distinct(Room.id)).label("room_count"),
            func.count(UserRoom.id).label("binding_count"),
            func.count(UserRoom.id).filter(UserRoom.enabled.is_(True)).label("enabled_binding_count"),
            func.count(func.distinct(UserRoom.user_id)).label("user_count"),
        )
        .join(UserRoom, UserRoom.room_id == Room.id)
        .group_by(*group_columns)
    )

    latest_reading_id = (
        select(ElectricityReading.id)
        .where(ElectricityReading.room_id == Room.id)
        .order_by(ElectricityReading.read_at.desc(), ElectricityReading.id.desc())
        .limit(1)
        .correlate(Room)
        .scalar_subquery()
    )
    bound_rooms = select(UserRoom.room_id.label("room_id")).distinct().subquery()
    balance_rows = db.execute(
        select(
            *group_columns,
            func.count(ElectricityReading.id).label("rooms_with_readings"),
            func.avg(ElectricityReading.balance).label("average_latest_balance"),
            func.max(ElectricityReading.read_at).label("latest_read_at"),
        )
        .join(bound_rooms, bound_rooms.c.room_id == Room.id)
        .outerjoin(ElectricityReading, ElectricityReading.id == latest_reading_id)
        .group_by(*group_columns)
    )
    balance_by_building = {
        (row.campus, row.building_key, row.building_name, row.building_param): row for row in balance_rows
    }

    stats: list[AdminBuildingStat] = []
    for row in binding_rows:
        key = (row.campus, row.building_key, row.building_name, row.building_param)
        balance = balance_by_building.get(key)
        stats.append(
            AdminBuildingStat(
                campus=row.campus,
                building_key=row.building_key,
                building_name=row.building_name,
                room_count=_count(row.room_count),
                binding_count=_count(row.binding_count),
                enabled_binding_count=_count(row.enabled_binding_count),
                user_count=_count(row.user_count),
                rooms_with_readings=_count(balance.rooms_with_readings) if balance is not None else 0,
                average_latest_balance=balance.average_latest_balance if balance is not None else None,
                latest_read_at=balance.latest_read_at if balance is not None else None,
            )
        )
    return sorted(stats, key=lambda item: (-item.binding_count, -item.room_count, item.building_name))


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
        activity_series=_build_activity_series(db),
        building_stats=_build_building_stats(db),
    )
