"""Incremental synchronization of the extra read-only HWGL datasets."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.electricity.hwgl_client import SHANGHAI_TZ, HwglElectricityClient, HwglRechargeRecord
from app.electricity.provider import HWGL_PROVIDER
from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.services.electricity_queries import apply_query_resolution, reading_from_query


logger = logging.getLogger(__name__)


@dataclass
class HwglRoomSyncOutcome:
    room_id: int
    daily_readings_upserted: int = 0
    recharges_upserted: int = 0
    price_updated: bool = False
    errors: list[str] = field(default_factory=list)


@dataclass
class HwglSyncSummary:
    rooms_scanned: int = 0
    rooms_succeeded: int = 0
    rooms_failed: int = 0
    daily_readings_upserted: int = 0
    recharges_upserted: int = 0
    prices_updated: int = 0
    failures: list[int] = field(default_factory=list)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _same_datetime(left: datetime | None, right: datetime | None) -> bool:
    return _as_utc(left) == _as_utc(right)


def _price_is_fresh(room: Room, now: datetime) -> bool:
    if room.provider_price is None or room.provider_price_updated_at is None:
        return False
    updated_at = room.provider_price_updated_at
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return updated_at >= now - timedelta(hours=24)


def _upsert_daily_readings(
    db: Session,
    room: Room,
    results,
    *,
    price=None,
) -> int:
    dates = {result.reported_usage_date for result in results if result.reported_usage_date is not None}
    if not dates:
        return 0
    existing = list(
        db.scalars(
            select(ElectricityReading).where(
                ElectricityReading.room_id == room.id,
                ElectricityReading.provider == HWGL_PROVIDER,
                ElectricityReading.source == "hwgl_daily_sync",
                ElectricityReading.reported_usage_date.in_(dates),
            )
        )
    )
    existing_by_date = {item.reported_usage_date: item for item in existing}
    changed = 0
    for result in results:
        if result.reported_usage_date is None or result.balance is None:
            continue
        if price is not None:
            result.electricity_price = price
            result.estimated_amount = result.balance * price
        current = existing_by_date.get(result.reported_usage_date)
        if current is None:
            db.add(reading_from_query(room.id, result, source="hwgl_daily_sync"))
            changed += 1
            continue
        incoming_at = result.provider_updated_at
        current_at = current.provider_updated_at
        if incoming_at is not None and current_at is not None and _as_utc(incoming_at) <= _as_utc(current_at):
            continue
        incoming_values = {
            "balance": result.balance,
            "provider_updated_at": result.provider_updated_at,
            "reported_daily_usage": result.reported_daily_usage,
            "power_status": result.power_status,
            "free_electricity": result.free_electricity,
            "paid_electricity": result.paid_electricity,
            "arrears_electricity": result.arrears_electricity,
            "electricity_price": result.electricity_price,
            "estimated_amount": result.estimated_amount,
        }
        if any(getattr(current, key) != value for key, value in incoming_values.items()):
            for key, value in incoming_values.items():
                setattr(current, key, value)
            changed += 1
    return changed


def _upsert_recharges(db: Session, room: Room, records: list[HwglRechargeRecord]) -> int:
    if not records:
        return 0
    hashes = {record.external_id_hash for record in records}
    existing = list(
        db.scalars(
            select(ElectricityRecharge).where(
                ElectricityRecharge.room_id == room.id,
                ElectricityRecharge.provider == HWGL_PROVIDER,
                ElectricityRecharge.external_id_hash.in_(hashes),
            )
        )
    )
    existing_by_hash = {item.external_id_hash: item for item in existing}
    changed = 0
    for record in records:
        current = existing_by_hash.get(record.external_id_hash)
        if current is None:
            db.add(
                ElectricityRecharge(
                    room_id=room.id,
                    provider=HWGL_PROVIDER,
                    external_id_hash=record.external_id_hash,
                    external_id_tail=record.external_id_tail,
                    paid_at=record.paid_at,
                    amount=record.amount,
                    line_type=record.line_type,
                    payment_status=record.payment_status,
                    processing_status=record.processing_status,
                )
            )
            changed += 1
            continue
        incoming_values = {
            "external_id_tail": record.external_id_tail,
            "paid_at": record.paid_at,
            "amount": record.amount,
            "line_type": record.line_type,
            "payment_status": record.payment_status,
            "processing_status": record.processing_status,
        }
        values_changed = any(
            (
                not _same_datetime(getattr(current, key), value)
                if key == "paid_at"
                else getattr(current, key) != value
            )
            for key, value in incoming_values.items()
        )
        if values_changed:
            for key, value in incoming_values.items():
                setattr(current, key, value)
            changed += 1
        current.fetched_at = _now()
    return changed


def sync_hwgl_room(
    db: Session,
    room: Room,
    *,
    client: HwglElectricityClient | None = None,
    history_days: int | None = None,
    recharge_days: int | None = None,
) -> HwglRoomSyncOutcome:
    """Synchronize one HWGL room without sending notifications."""
    if room.provider != HWGL_PROVIDER:
        raise ValueError("room does not use the HWGL provider")
    hwgl = client or HwglElectricityClient()
    outcome = HwglRoomSyncOutcome(room_id=room.id)
    now = _now()
    price = room.provider_price

    if not _price_is_fresh(room, now):
        try:
            price_record = hwgl.query_price(room)
            if price_record is not None:
                price = price_record.price
                room.provider_price = price_record.price
                room.provider_price_updated_at = price_record.fetched_at
                outcome.price_updated = True
        except Exception as exc:  # metadata must not block daily usage sync
            logger.warning("HWGL price sync failed for room_id=%s: %s", room.id, exc)
            outcome.errors.append("price")

    today = datetime.now(SHANGHAI_TZ).date()
    days = max(1, history_days or settings.hwgl_metadata_history_days)
    try:
        daily_results = hwgl.query_daily_records(room, today - timedelta(days=days - 1), today)
        for result in daily_results:
            apply_query_resolution(room, result)
        outcome.daily_readings_upserted = _upsert_daily_readings(db, room, daily_results, price=price)
    except Exception as exc:
        logger.warning("HWGL daily metadata sync failed for room_id=%s: %s", room.id, exc)
        outcome.errors.append("daily")

    try:
        window_days = max(1, recharge_days or settings.hwgl_recharge_history_days)
        recharge_records = hwgl.query_recharges(
            room,
            start_at=now - timedelta(days=window_days),
            end_at=now,
        )
        outcome.recharges_upserted = _upsert_recharges(db, room, recharge_records)
    except Exception as exc:
        logger.warning("HWGL recharge sync failed for room_id=%s: %s", room.id, exc)
        outcome.errors.append("recharges")

    db.commit()
    return outcome


def _bound_hwgl_rooms(db: Session) -> list[Room]:
    return list(
        db.scalars(
            select(Room)
            .join(UserRoom, UserRoom.room_id == Room.id)
            .join(User, User.id == UserRoom.user_id)
            .where(
                Room.provider == HWGL_PROVIDER,
                Room.probe_only.is_(False),
                UserRoom.enabled.is_(True),
                User.is_verified.is_(True),
            )
            .distinct()
            .order_by(Room.id)
        )
    )


def run_hwgl_metadata_sync(
    *,
    limit: int | None = None,
    delay_seconds: float = 0.2,
) -> HwglSyncSummary:
    with SessionLocal() as db:
        rooms = _bound_hwgl_rooms(db)
        if limit is not None:
            rooms = rooms[:limit]
        summary = HwglSyncSummary(rooms_scanned=len(rooms))
        client = HwglElectricityClient()
        for index, room in enumerate(rooms):
            try:
                outcome = sync_hwgl_room(db, room, client=client)
                summary.rooms_succeeded += 1
                summary.daily_readings_upserted += outcome.daily_readings_upserted
                summary.recharges_upserted += outcome.recharges_upserted
                summary.prices_updated += int(outcome.price_updated)
                if outcome.errors:
                    logger.info("HWGL metadata sync partial failure: room_id=%s parts=%s", room.id, outcome.errors)
            except Exception:
                db.rollback()
                summary.rooms_failed += 1
                summary.failures.append(room.id)
                logger.exception("HWGL metadata sync failed for room_id=%s", room.id)
            if delay_seconds > 0 and index < len(rooms) - 1:
                time.sleep(delay_seconds)
        return summary
