from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models.notification import Notification
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.emailer import EmailSendResult, send_email
from app.services.runtime_settings import get_runtime_config
from app.services.usage import get_room_usage_stats


def now_like(value: datetime | None = None) -> datetime:
    tzinfo = value.tzinfo if value is not None else None
    return datetime.now(tzinfo) if tzinfo is not None else datetime.now()


@dataclass(frozen=True)
class NotificationBatchResult:
    scanned: int
    sent: int
    skipped: int
    failed: int
    notifications: list[int] = field(default_factory=list)


@dataclass(frozen=True)
class DailyReportBatchResult:
    scanned: int
    sent: int
    skipped: int
    failed: int


def _effective_notify_cooldown_hours(db, binding: UserRoom) -> int:
    runtime = get_runtime_config(db)
    if binding.notify_cooldown_hours is not None:
        return binding.notify_cooldown_hours
    if binding.user is not None and binding.user.notify_cooldown_hours is not None:
        return binding.user.notify_cooldown_hours
    return runtime.notify_cooldown_hours


def _recent_notification_exists(db, binding: UserRoom) -> bool:
    cooldown_hours = _effective_notify_cooldown_hours(db, binding)
    if cooldown_hours <= 0:
        return False
    cutoff = now_like() - timedelta(hours=cooldown_hours)
    existing = db.scalar(
        select(Notification.id)
        .where(
            Notification.user_room_id == binding.id,
            Notification.kind == "low_power",
            Notification.status == "sent",
            Notification.sent_at >= cutoff,
        )
        .limit(1)
    )
    return existing is not None


def _format_value(value, suffix: str = "") -> str:
    if value is None:
        return "暂无"
    return f"{value}{suffix}"


def _build_low_power_email(user: User, binding: UserRoom, stats) -> tuple[str, str]:
    room = binding.room
    subject = f"低电量提醒 - {room.building_name} {room.room_number}"
    lines = [
        "Electricity Monitor",
        "",
        "你绑定的宿舍当前电量可能偏低。",
        "",
        f"📍 位置：{room.campus} {room.building_name} {room.room_number}",
        f"🔋 当前剩余电量：{_format_value(stats.latest_balance, ' 度')}",
        f"⚡ 预计日均用电：{_format_value(stats.average_daily_usage, ' 度/天')}",
        f"⏳ 预计剩余天数：{_format_value(stats.days_remaining, ' 天')}",
        f"🚨 提醒阈值：{_format_value(stats.alert_threshold, ' 度')}",
        "⚠️ 状态：电量偏低",
        "",
        "这封邮件由 Electricity Monitor 自动发送。",
    ]
    return subject, "\n".join(lines)


def _build_power_report_email(db: Session, user: User, bindings: list[UserRoom], *, test: bool = False) -> tuple[str, str]:
    subject_prefix = "测试邮件" if test else "用电日报"
    subject = f"{subject_prefix} - Electricity Monitor"
    lines = [
        "Electricity Monitor",
        "",
        "以下是你绑定宿舍的最新电量信息：",
        "",
    ]
    if not bindings:
        lines.extend(["你还没有绑定宿舍。", ""])
    for binding in bindings:
        stats, readings = get_room_usage_stats(
            db,
            binding.room_id,
            alert_days=binding.alert_days,
            fixed_threshold=binding.low_power_threshold,
        )
        room = binding.room
        status_text = "电量偏低" if stats.is_low_power else "正常"
        status_icon = "⚠️" if stats.is_low_power else "✅"
        lines.extend(
            [
                f"📍 位置：{room.campus} {room.building_name} {room.room_number}",
                f"🔋 当前剩余电量：{_format_value(stats.latest_balance, ' 度')}",
                f"⚡ 预计日均用电：{_format_value(stats.average_daily_usage, ' 度/天')}",
                f"⏳ 预计剩余天数：{_format_value(stats.days_remaining, ' 天')}",
                f"🚨 提醒阈值：{_format_value(stats.alert_threshold, ' 度')}",
                f"{status_icon} 状态：{status_text}",
                "",
            ]
        )
        if not readings:
            lines.append("  还没有历史读数，worker 下一次同步后会更准确。")
            lines.append("")
    if test:
        lines.append("这是一封测试邮件，用于确认提醒邮箱可以正常接收 Electricity Monitor 邮件。")
    else:
        lines.append("这是一封自动发送的用电日报。你可以在设置页关闭日报或调整发送间隔。")
    lines.append("")
    lines.append("Electricity Monitor")
    return subject, "\n".join(lines)


def send_test_email_for_user(db: Session, user: User) -> EmailSendResult:
    bindings = list(
        db.scalars(
            select(UserRoom)
            .options(selectinload(UserRoom.room))
            .where(UserRoom.user_id == user.id, UserRoom.enabled.is_(True))
            .order_by(UserRoom.id)
        )
    )
    subject, body = _build_power_report_email(db, user, bindings, test=True)
    return send_email(user.notification_recipient_email, subject, body)


def _daily_report_due(user: User, now: datetime) -> bool:
    if not user.daily_report_enabled:
        return False
    interval_days = max(1, user.daily_report_interval_days or 1)
    if user.daily_report_last_sent_at is None:
        return True
    comparable_now = now_like(user.daily_report_last_sent_at)
    return user.daily_report_last_sent_at + timedelta(days=interval_days) <= comparable_now


def run_daily_reports() -> DailyReportBatchResult:
    now = now_like()
    scanned = sent = skipped = failed = 0
    with SessionLocal() as db:
        users = list(db.scalars(select(User).where(User.is_verified.is_(True)).order_by(User.id)))
        for user in users:
            scanned += 1
            if not _daily_report_due(user, now):
                skipped += 1
                continue
            bindings = list(
                db.scalars(
                    select(UserRoom)
                    .options(selectinload(UserRoom.room))
                    .where(UserRoom.user_id == user.id, UserRoom.enabled.is_(True))
                    .order_by(UserRoom.id)
                )
            )
            subject, body = _build_power_report_email(db, user, bindings, test=False)
            result = send_email(user.notification_recipient_email, subject, body)
            if result.ok:
                user.daily_report_last_sent_at = datetime.now()
                sent += 1
            else:
                failed += 1
            db.commit()
    return DailyReportBatchResult(scanned=scanned, sent=sent, skipped=skipped, failed=failed)


def run_low_power_notifications(*, limit: int | None = None) -> NotificationBatchResult:
    scanned = sent = skipped = failed = 0
    notification_ids: list[int] = []

    with SessionLocal() as db:
        stmt = (
            select(UserRoom)
            .options(selectinload(UserRoom.user), selectinload(UserRoom.room))
            .where(UserRoom.enabled.is_(True))
            .order_by(UserRoom.id)
        )
        if limit is not None:
            stmt = stmt.limit(limit)

        for binding in db.scalars(stmt):
            scanned += 1
            user = binding.user
            if user is None or not user.is_verified:
                skipped += 1
                continue
            if _recent_notification_exists(db, binding):
                skipped += 1
                continue

            stats, readings = get_room_usage_stats(
                db,
                binding.room_id,
                alert_days=binding.alert_days,
                fixed_threshold=binding.low_power_threshold,
            )
            if not readings or not stats.is_low_power:
                skipped += 1
                continue

            recipient_email = user.notification_recipient_email
            subject, body = _build_low_power_email(user, binding, stats)
            latest_reading = readings[-1]
            notification = Notification(
                user_id=user.id,
                room_id=binding.room_id,
                user_room_id=binding.id,
                reading_id=latest_reading.id,
                kind="low_power",
                status="pending",
                recipient_email=recipient_email,
                subject=subject,
                body=body,
            )
            db.add(notification)
            db.flush()

            result = send_email(recipient_email, subject, body)
            if result.ok:
                notification.status = "sent"
                notification.sent_at = datetime.now()
                sent += 1
            else:
                notification.status = "error"
                notification.error_msg = result.error
                failed += 1

            notification_ids.append(notification.id)
            db.commit()

    return NotificationBatchResult(
        scanned=scanned,
        sent=sent,
        skipped=skipped,
        failed=failed,
        notifications=notification_ids,
    )
