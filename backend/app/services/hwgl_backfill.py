"""Replace stale legacy readings with real HWGL history for migrated rooms."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.session import stored_datetime_key
from app.electricity.client import ElectricityQueryResult
from app.electricity.hwgl_client import SHANGHAI_TZ, HwglElectricityClient
from app.electricity.provider import HWGL_PROVIDER
from app.models.check_attempt import CheckAttempt
from app.models.electricity_reading import ElectricityReading
from app.models.notification import Notification
from app.models.room import Room
from app.services.electricity_queries import apply_query_resolution, reading_from_query


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HwglBackfillOptions:
    days: int = 30
    limit: int | None = None
    delay_seconds: float = 0.05
    purge_legacy: bool = True
    today: date | None = None


@dataclass(frozen=True)
class HwglBackfillFailure:
    room_id: int
    error_kind: str


@dataclass
class HwglBackfillSummary:
    rooms_scanned: int = 0
    rooms_refreshed: int = 0
    rooms_failed: int = 0
    readings_inserted: int = 0
    legacy_readings_deleted: int = 0
    failures: list[HwglBackfillFailure] = field(default_factory=list)


def _validate_options(options: HwglBackfillOptions) -> None:
    if options.days < 1:
        raise ValueError("days must be at least 1")
    if options.limit is not None and options.limit < 1:
        raise ValueError("limit must be at least 1")
    if options.delay_seconds < 0:
        raise ValueError("delay_seconds cannot be negative")


def _fingerprint(
    db: Session,
    provider_updated_at: datetime | None,
    reported_usage_date: date | None,
    balance: Decimal,
) -> tuple[datetime | None, date | None, Decimal]:
    return stored_datetime_key(db, provider_updated_at), reported_usage_date, balance


def _load_hwgl_rooms(db: Session, limit: int | None) -> list[Room]:
    stmt = select(Room).where(Room.provider == HWGL_PROVIDER, Room.probe_only.is_(False)).order_by(Room.id)
    if limit is not None:
        stmt = stmt.limit(limit)
    rooms = list(db.scalars(stmt))
    db.commit()
    return rooms


def _query_history(
    client: HwglElectricityClient,
    room: Room,
    current_date: date,
    options: HwglBackfillOptions,
) -> tuple[list[ElectricityQueryResult], str]:
    successful_results: list[ElectricityQueryResult] = []
    last_error_kind = "no_reading"
    for offset in range(options.days):
        result = client.query_room_for_date(room, current_date - timedelta(days=offset))
        if result.success and result.balance is not None:
            apply_query_resolution(room, result)
            successful_results.append(result)
        else:
            last_error_kind = result.error_kind or "unknown"
            if last_error_kind != "no_reading":
                break
        if options.delay_seconds > 0:
            time.sleep(options.delay_seconds)
    return successful_results, last_error_kind


def _existing_fingerprints(
    db: Session,
    room_id: int,
) -> set[tuple[datetime | None, date | None, Decimal]]:
    rows = db.execute(
        select(
            ElectricityReading.provider_updated_at,
            ElectricityReading.reported_usage_date,
            ElectricityReading.balance,
        ).where(
            ElectricityReading.room_id == room_id,
            ElectricityReading.provider == HWGL_PROVIDER,
        )
    )
    return {
        _fingerprint(db, row.provider_updated_at, row.reported_usage_date, row.balance)
        for row in rows
    }


def _insert_history(
    db: Session,
    room: Room,
    results: list[ElectricityQueryResult],
) -> int:
    existing = _existing_fingerprints(db, room.id)
    inserted = 0
    for result in reversed(results):
        if result.balance is None:
            continue
        reading = reading_from_query(room.id, result, source="hwgl_backfill")
        fingerprint = _fingerprint(
            db,
            result.provider_updated_at,
            result.reported_usage_date,
            reading.balance,
        )
        if fingerprint in existing:
            continue
        db.add(reading)
        existing.add(fingerprint)
        inserted += 1
    return inserted


def _purge_legacy_readings(db: Session, room_id: int) -> int:
    legacy_ids = select(ElectricityReading.id).where(
        ElectricityReading.room_id == room_id,
        ElectricityReading.provider != HWGL_PROVIDER,
    )
    db.execute(
        update(CheckAttempt)
        .where(CheckAttempt.reading_id.in_(legacy_ids))
        .values(reading_id=None)
    )
    db.execute(update(Notification).where(Notification.reading_id.in_(legacy_ids)).values(reading_id=None))
    result = db.execute(
        delete(ElectricityReading).where(
            ElectricityReading.room_id == room_id,
            ElectricityReading.provider != HWGL_PROVIDER,
        )
    )
    return int(result.rowcount or 0)


def _record_failure(summary: HwglBackfillSummary, room_id: int, error_kind: str) -> None:
    summary.rooms_failed += 1
    summary.failures.append(HwglBackfillFailure(room_id=room_id, error_kind=error_kind))


def _store_room_history(
    db: Session,
    room: Room,
    results: list[ElectricityQueryResult],
    *,
    purge_legacy: bool,
) -> tuple[int, int]:
    inserted = _insert_history(db, room, results)
    db.flush()
    deleted = _purge_legacy_readings(db, room.id) if purge_legacy else 0
    db.commit()
    return inserted, deleted


def backfill_hwgl_rooms(
    db: Session,
    *,
    options: HwglBackfillOptions | None = None,
    client: HwglElectricityClient | None = None,
) -> HwglBackfillSummary:
    """Backfill exact daily HWGL records, then remove stale mcard points on success."""
    effective_options = options or HwglBackfillOptions()
    _validate_options(effective_options)
    rooms = _load_hwgl_rooms(db, effective_options.limit)
    summary = HwglBackfillSummary(rooms_scanned=len(rooms))
    hwgl = client or HwglElectricityClient()
    current_date = effective_options.today or datetime.now(SHANGHAI_TZ).date()

    for room in rooms:
        try:
            results, error_kind = _query_history(hwgl, room, current_date, effective_options)
            if not results or error_kind != "no_reading":
                db.rollback()
                _record_failure(summary, room.id, error_kind)
                continue
            inserted, deleted = _store_room_history(
                db,
                room,
                results,
                purge_legacy=effective_options.purge_legacy,
            )
            summary.rooms_refreshed += 1
            summary.readings_inserted += inserted
            summary.legacy_readings_deleted += deleted
        except Exception:
            db.rollback()
            logger.exception("HWGL history backfill failed for room_id=%s", room.id)
            _record_failure(summary, room.id, "internal")

    return summary
