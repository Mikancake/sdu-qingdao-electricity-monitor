from dataclasses import dataclass, field
from datetime import datetime, timedelta
from html import escape

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


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text_body: str
    html_body: str


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


def _format_daily_usage(stats) -> str:
    if stats.average_daily_usage is None:
        return "暂无（至少需要有效下降读数）"
    return _format_value(stats.average_daily_usage, " 度/天")


def _format_days_remaining(stats) -> str:
    if stats.days_remaining is None:
        return "暂无（数据不足）"
    return _format_value(stats.days_remaining, " 天")


def _format_threshold(stats) -> str:
    value = _format_value(stats.alert_threshold, " 度")
    if stats.alert_threshold is None:
        return value
    if stats.alert_threshold_source == "default":
        return f"{value}（默认估算）"
    if stats.alert_threshold_source == "fixed":
        return f"{value}（固定）"
    return value


def _room_location(binding: UserRoom) -> str:
    room = binding.room
    return f"{room.campus} {room.building_name} {room.room_number}"


def _metric_row(label: str, value: str, accent: str = "#4f46e5") -> str:
    return f"""
      <tr>
        <td style="padding:13px 0;border-top:1px solid #e8edf5;">
          <div style="color:#667085;font-size:13px;line-height:1.45;">{escape(label)}</div>
          <div style="margin-top:5px;color:#101828;font-size:18px;font-weight:800;line-height:1.45;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:{accent};margin-right:8px;vertical-align:middle;"></span>{escape(value)}
          </div>
        </td>
      </tr>
    """


def _room_card(binding: UserRoom, stats, *, readings_available: bool = True) -> str:
    status_text = "电量偏低" if stats.is_low_power else "状态正常"
    status_color = "#dc2626" if stats.is_low_power else "#16a34a"
    status_bg = "#fef2f2" if stats.is_low_power else "#ecfdf3"
    status_border = "#fecaca" if stats.is_low_power else "#bbf7d0"
    latest_balance = _format_value(stats.latest_balance, " 度")
    avg_usage = _format_daily_usage(stats)
    days_remaining = _format_days_remaining(stats)
    threshold = _format_threshold(stats)
    if not readings_available:
        note = """
          <tr>
            <td style="padding:14px 0 0;">
              <div style="border-radius:12px;background:#f8fafc;border:1px solid #e8edf5;padding:11px 12px;color:#667085;font-size:13px;line-height:1.7;">
                还没有历史读数，下一次同步后日报会更准确。
              </div>
            </td>
          </tr>
        """
    elif stats.average_daily_usage_source != "measured":
        note = """
          <tr>
            <td style="padding:14px 0 0;">
              <div style="border-radius:12px;background:#f8fafc;border:1px solid #e8edf5;padding:11px 12px;color:#667085;font-size:13px;line-height:1.7;">
                历史读数还不足以计算实测日均用电；低电量判断会先使用默认日均作为兜底。
              </div>
            </td>
          </tr>
        """
    else:
        note = ""

    return f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin:14px 0;border:1px solid #dfe7f1;border-left:4px solid {status_color};border-radius:16px;background:#ffffff;box-shadow:0 10px 26px rgba(15,23,42,.07);">
        <tr>
          <td style="padding:18px 18px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
              <tr>
                <td style="vertical-align:top;padding:0 12px 0 0;">
                  <div style="font-size:13px;color:#667085;line-height:1.5;">宿舍位置</div>
                  <div style="margin-top:4px;font-size:19px;font-weight:800;color:#101828;line-height:1.35;">{escape(_room_location(binding))}</div>
                </td>
                <td align="right" style="vertical-align:top;width:1%;white-space:nowrap;padding:0;">
                  <span style="display:inline-block;border:1px solid {status_border};border-radius:999px;background:{status_bg};color:{status_color};padding:7px 11px;font-size:13px;font-weight:800;line-height:1;">{status_text}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 18px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px;">
          {_metric_row("当前剩余电量", latest_balance, status_color)}
          {_metric_row("预计日均用电", avg_usage, "#0ea5e9")}
          {_metric_row("预计剩余天数", days_remaining, "#8b5cf6")}
          {_metric_row("提醒阈值", threshold, "#f59e0b")}
          {note}
            </table>
          </td>
        </tr>
      </table>
    """


def _email_shell(title: str, subtitle: str, cards_html: str, footer: str) -> str:
    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#101828;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(title)} - {escape(subtitle)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f6fb" style="width:100%;border-collapse:collapse;background:#f3f6fb;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dfe7f1;border-radius:20px;overflow:hidden;box-shadow:0 18px 42px rgba(15,23,42,.08);">
            <tr>
              <td bgcolor="#2563eb" style="height:7px;line-height:7px;font-size:0;background:#2563eb;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 22px 18px;background:#ffffff;">
                <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;font-weight:800;line-height:1.4;">Electricity Monitor</div>
                <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.28;color:#101828;font-weight:850;">{escape(title)}</h1>
                <p style="margin:0;color:#475467;line-height:1.75;font-size:14px;">{escape(subtitle)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px 8px;background:#ffffff;">{cards_html}</td>
            </tr>
            <tr>
              <td style="padding:2px 22px 24px;background:#ffffff;">
                <div style="border-top:1px solid #e8edf5;padding-top:14px;color:#667085;font-size:13px;line-height:1.7;">{escape(footer)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _build_low_power_email(user: User, binding: UserRoom, stats) -> EmailContent:
    subject = f"低电量提醒 - {binding.room.building_name} {binding.room.room_number}"
    lines = [
        "Electricity Monitor",
        "",
        "你绑定的宿舍当前电量可能偏低。",
        "",
        f"位置：{_room_location(binding)}",
        f"当前剩余电量：{_format_value(stats.latest_balance, ' 度')}",
        f"预计日均用电：{_format_daily_usage(stats)}",
        f"预计剩余天数：{_format_days_remaining(stats)}",
        f"提醒阈值：{_format_threshold(stats)}",
        "状态：电量偏低",
        "",
        "这封邮件由 Electricity Monitor 自动发送。",
    ]
    html_body = _email_shell(
        "低电量提醒",
        "你绑定的宿舍电量已经低于当前提醒阈值，建议及时关注。",
        _room_card(binding, stats),
        "这封邮件由 Electricity Monitor 自动发送。你可以在设置页调整提醒阈值和通知间隔。",
    )
    return EmailContent(subject, "\n".join(lines), html_body)


def _build_power_report_email(db: Session, user: User, bindings: list[UserRoom], *, test: bool = False) -> EmailContent:
    title = "测试邮件" if test else "用电日报"
    subject = f"{title} - Electricity Monitor"
    lines = [
        "Electricity Monitor",
        "",
        "以下是你绑定宿舍的最新电量信息：",
        "",
    ]
    cards: list[str] = []

    if not bindings:
        lines.extend(["你还没有绑定宿舍。", ""])
        cards.append(
            """
            <div style="border:1px dashed #cbd5e1;border-radius:18px;background:rgba(255,255,255,.9);padding:24px;text-align:center;color:#667085;">
              你还没有绑定宿舍。
            </div>
            """
        )

    for binding in bindings:
        stats, readings = get_room_usage_stats(
            db,
            binding.room_id,
            alert_days=binding.alert_days,
            alert_threshold_mode=binding.alert_threshold_mode,
            fixed_threshold=binding.low_power_threshold,
        )
        status_text = "电量偏低" if stats.is_low_power else "正常"
        lines.extend(
            [
                f"位置：{_room_location(binding)}",
                f"当前剩余电量：{_format_value(stats.latest_balance, ' 度')}",
                f"预计日均用电：{_format_daily_usage(stats)}",
                f"预计剩余天数：{_format_days_remaining(stats)}",
                f"提醒阈值：{_format_threshold(stats)}",
                f"状态：{status_text}",
                "",
            ]
        )
        if not readings:
            lines.extend(["还没有历史读数，下一次同步后日报会更准确。", ""])
        elif stats.average_daily_usage_source != "measured":
            lines.extend(["历史读数还不足以计算实测日均用电，暂不展示实测日均。", ""])
        cards.append(_room_card(binding, stats, readings_available=bool(readings)))

    if test:
        lines.append("这是一封测试邮件，用于确认提醒邮箱可以正常接收 Electricity Monitor 邮件。")
        subtitle = "这是一封测试邮件，用于确认你的提醒邮箱可以正常接收通知。"
    else:
        lines.append("这是一封自动发送的用电日报。你可以在设置页关闭日报或调整发送间隔。")
        subtitle = "以下是你绑定宿舍的最新电量信息。"
    lines.extend(["", "Electricity Monitor"])

    html_body = _email_shell(
        title,
        subtitle,
        "".join(cards),
        "你可以在 Electricity Monitor 的设置页调整日报、低电量提醒阈值和通知间隔。",
    )
    return EmailContent(subject, "\n".join(lines), html_body)


def send_test_email_for_user(db: Session, user: User) -> EmailSendResult:
    bindings = list(
        db.scalars(
            select(UserRoom)
            .options(selectinload(UserRoom.room))
            .where(UserRoom.user_id == user.id, UserRoom.enabled.is_(True))
            .order_by(UserRoom.id)
        )
    )
    content = _build_power_report_email(db, user, bindings, test=True)
    return send_email(
        user.notification_recipient_email,
        content.subject,
        content.text_body,
        html_body=content.html_body,
        source="user_test",
    )


def _daily_report_due(user: User, now: datetime) -> bool:
    if not user.daily_report_enabled:
        return False
    interval_days = max(1, user.daily_report_interval_days or 1)
    if user.daily_report_last_sent_at is None:
        return True
    comparable_now = now_like(user.daily_report_last_sent_at) if user.daily_report_last_sent_at.tzinfo else now
    elapsed_days = (comparable_now.date() - user.daily_report_last_sent_at.date()).days
    return elapsed_days >= interval_days


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
            content = _build_power_report_email(db, user, bindings, test=False)
            result = send_email(
                user.notification_recipient_email,
                content.subject,
                content.text_body,
                html_body=content.html_body,
                source="daily_report",
            )
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
                alert_threshold_mode=binding.alert_threshold_mode,
                fixed_threshold=binding.low_power_threshold,
            )
            if not readings or not stats.is_low_power:
                skipped += 1
                continue

            recipient_email = user.notification_recipient_email
            content = _build_low_power_email(user, binding, stats)
            latest_reading = readings[-1]
            notification = Notification(
                user_id=user.id,
                room_id=binding.room_id,
                user_room_id=binding.id,
                reading_id=latest_reading.id,
                kind="low_power",
                status="pending",
                recipient_email=recipient_email,
                subject=content.subject,
                body=content.text_body,
            )
            db.add(notification)
            db.flush()

            result = send_email(
                recipient_email,
                content.subject,
                content.text_body,
                html_body=content.html_body,
                source="low_power",
                notification_id=notification.id,
            )
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
