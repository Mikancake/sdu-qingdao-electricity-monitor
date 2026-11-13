"""Administrator-only HWGL freshness probes.

Probe samples are deliberately kept outside ``electricity_readings`` so an
experiment cannot change user charts, daily averages, or notifications.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.electricity.client import ElectricityQueryResult
from app.electricity.hwgl_client import HwglElectricityClient
from app.models.hwgl_probe import HwglProbeSample, HwglProbeSession


logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _snapshot_hash(result) -> str | None:
    if not result.success or result.balance is None:
        return None
    payload = {
        "balance": str(result.balance),
        "provider_updated_at": result.provider_updated_at.isoformat() if result.provider_updated_at else None,
        "reported_daily_usage": str(result.reported_daily_usage) if result.reported_daily_usage is not None else None,
        "reported_usage_date": result.reported_usage_date.isoformat() if result.reported_usage_date else None,
        "power_status": result.power_status,
    }
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _summary(db: Session, session_id: int) -> dict[str, object]:
    samples = list(
        db.scalars(
            select(HwglProbeSample)
            .where(HwglProbeSample.session_id == session_id)
            .order_by(HwglProbeSample.requested_at)
        )
    )
    successes = [sample for sample in samples if sample.success]
    timestamps = [sample.provider_updated_at for sample in successes if sample.provider_updated_at is not None]
    update_intervals: list[float] = []
    for before, after in zip(timestamps, timestamps[1:]):
        delta = (_as_utc(after) - _as_utc(before)).total_seconds()
        if delta > 0:
            update_intervals.append(delta)
    unique_hashes = {sample.response_hash for sample in successes if sample.response_hash}
    latency_values = [sample.latency_ms for sample in samples if sample.latency_ms is not None]
    return {
        "sample_count": len(samples),
        "successful_samples": len(successes),
        "unique_snapshot_count": len(unique_hashes),
        "unchanged_response_ratio": round((len(successes) - len(unique_hashes)) / len(successes), 4) if successes else None,
        "provider_update_intervals_seconds": {
            "count": len(update_intervals),
            "minimum": min(update_intervals) if update_intervals else None,
            "maximum": max(update_intervals) if update_intervals else None,
            "average": round(sum(update_intervals) / len(update_intervals), 2) if update_intervals else None,
        },
        "latency_ms": {
            "minimum": min(latency_values) if latency_values else None,
            "maximum": max(latency_values) if latency_values else None,
            "average": round(sum(latency_values) / len(latency_values), 2) if latency_values else None,
        },
    }


def _finish(db: Session, session: HwglProbeSession, status: str, now: datetime) -> None:
    details = _summary(db, session.id)
    session.status = status
    session.finished_at = now
    session.sample_count = int(details["sample_count"])
    session.unique_snapshot_count = int(details["unique_snapshot_count"])
    session.summary_json = json.dumps(details, ensure_ascii=False, separators=(",", ":"))


def run_hwgl_probe_jobs(*, max_sessions: int = 4) -> int:
    """Run due samples for active probe sessions; return processed count."""
    processed = 0
    for _ in range(max(1, max_sessions)):
        with SessionLocal() as db:
            now = _now()
            session = db.scalar(
                select(HwglProbeSession)
                .options(selectinload(HwglProbeSession.room))
                .where(
                    HwglProbeSession.status == "running",
                    HwglProbeSession.next_run_at <= now,
                )
                .order_by(HwglProbeSession.next_run_at, HwglProbeSession.id)
                .with_for_update()
                .limit(1)
            )
            if session is None:
                break
            room = session.room
            if room is None or room.provider != "hwgl":
                _finish(db, session, "failed", now)
                db.commit()
                processed += 1
                continue
            started = _as_utc(session.started_at)
            if now >= started + timedelta(seconds=session.duration_seconds):
                _finish(db, session, "finished", now)
                db.commit()
                processed += 1
                continue
            session.next_run_at = now + timedelta(seconds=max(60, session.interval_seconds))
            db.commit()

        requested_at = now
        started_at = time.monotonic()
        try:
            result = HwglElectricityClient().query_room(room)
        except Exception as exc:  # Keep a failed sample for every scheduled attempt.
            logger.exception("HWGL probe request failed for session_id=%s", session.id)
            result = ElectricityQueryResult(
                success=False,
                provider="hwgl",
                error_kind="internal",
                error_msg=f"{type(exc).__name__}: {exc}",
            )
        received_at = _now()
        latency_ms = max(0, int((time.monotonic() - started_at) * 1000))
        with SessionLocal() as db:
            current = db.get(HwglProbeSession, session.id)
            if current is None or current.status != "running":
                continue
            db.add(
                HwglProbeSample(
                    session_id=current.id,
                    room_id=room.id,
                    requested_at=requested_at,
                    received_at=received_at,
                    provider_updated_at=result.provider_updated_at,
                    balance=result.balance,
                    reported_daily_usage=result.reported_daily_usage,
                    power_status=result.power_status,
                    response_hash=_snapshot_hash(result),
                    latency_ms=latency_ms,
                    http_status=200 if result.success else None,
                    success=result.success and result.balance is not None,
                    error_kind=result.error_kind,
                    error_msg=result.error_msg,
                )
            )
            db.flush()
            current.sample_count += 1
            if result.success and result.balance is not None:
                # The exact count is refreshed when the session finishes. This
                # lightweight update keeps the list view useful while running.
                current.unique_snapshot_count = int(
                    db.scalar(
                        select(func.count(func.distinct(HwglProbeSample.response_hash))).where(
                            HwglProbeSample.session_id == current.id,
                            HwglProbeSample.response_hash.is_not(None),
                        )
                    )
                    or 0
                )
            if received_at >= _as_utc(current.started_at) + timedelta(seconds=current.duration_seconds):
                db.flush()
                _finish(db, current, "finished", received_at)
            db.commit()
            processed += 1
    return processed


def stop_hwgl_probe(db: Session, session_id: int) -> HwglProbeSession | None:
    session = db.get(HwglProbeSession, session_id)
    if session is None:
        return None
    if session.status == "running":
        _finish(db, session, "stopped", _now())
        db.commit()
        db.refresh(session)
    return session
