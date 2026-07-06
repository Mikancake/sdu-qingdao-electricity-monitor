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
    cutoff = datetime.now() - timedelta(hours=cooldown_hours)
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


def _build_low_power_email(user: User, binding: UserRoom, stats) -> tuple[str, str]:
    room = binding.room
    subject = f"\u7535\u91cf\u4e0d\u8db3\u63d0\u9192\uff1a{room.building_name} {room.room_number}"
    body = (
        f"{user.email} \u4f60\u597d\uff0c\n\n"
        f"\u4f60\u7ed1\u5b9a\u7684\u5bbf\u820d {room.campus} {room.building_name} {room.room_number} "
        "\u5f53\u524d\u7535\u91cf\u53ef\u80fd\u504f\u4f4e\u3002\n\n"
        f"\u5f53\u524d\u7535\u91cf\uff1a{stats.latest_balance} \u5ea6\n"
        f"\u9884\u8ba1\u65e5\u5747\u7528\u7535\uff1a{stats.average_daily_usage} \u5ea6/\u5929\n"
        f"\u9884\u8ba1\u5269\u4f59\u5929\u6570\uff1a{stats.days_remaining} \u5929\n"
        f"\u63d0\u9192\u9608\u503c\uff1a{stats.alert_threshold} \u5ea6\n\n"
        "\u8fd9\u5c01\u90ae\u4ef6\u7531\u5c71\u5927\u9752\u5c9b\u6821\u533a\u7535\u91cf\u5e73\u53f0\u81ea\u52a8\u53d1\u9001\u3002"
    )
    return subject, body


def _build_power_report_email(db: Session, user: User, bindings: list[UserRoom], *, test: bool = False) -> tuple[str, str]:
    subject_prefix = "测试邮件" if test else "用电日报"
    subject = f"山大青岛校区电量平台{subject_prefix}"
    lines = [
        f"{user.email} 你好，",
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
        lines.extend(
            [
                f"- {room.campus} {room.building_name} {room.room_number}",
                f"  当前电量：{stats.latest_balance or '暂无'} 度",
                f"  预计日均用电：{stats.average_daily_usage or '暂无'} 度/天",
                f"  预计剩余天数：{stats.days_remaining or '暂无'} 天",
                f"  提醒阈值：{stats.alert_threshold or '暂无'} 度",
                f"  状态：{'电量偏低' if stats.is_low_power else '正常'}",
                "",
            ]
        )
        if not readings:
            lines.append("  还没有历史读数，worker 下一次同步后会更准确。")
            lines.append("")
    if test:
        lines.append("这是一封测试邮件，用于确认你的提醒邮箱可以正常接收平台邮件。")
    else:
        lines.append("这是一封自动发送的用电日报。你可以在平台设置页关闭日报或调整发送间隔。")
    lines.append("")
    lines.append("山大青岛校区电量平台")
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
    return user.daily_report_last_sent_at + timedelta(days=interval_days) <= now


def run_daily_reports() -> DailyReportBatchResult:
    now = datetime.now()
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
