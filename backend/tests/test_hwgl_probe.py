import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db.base import Base
from app.electricity.client import ElectricityQueryResult
from app.models.electricity_reading import ElectricityReading
from app.models.hwgl_probe import HwglProbeSample, HwglProbeSession
from app.models.room import Room
from app.services import hwgl_probe


def _room() -> Room:
    return Room(
        campus="青岛校区",
        campus_param="青岛校区&青岛校区",
        building_key="fenghuang_11",
        building_name="凤凰居11公寓",
        building_param="hwgl&凤凰居11公寓",
        room_number="TEST-901",
        provider="hwgl",
        provider_campus="山东大学青岛校区",
        provider_building="凤凰居11公寓",
    )


def _session(room_id: int, *, started_at: datetime | None = None) -> HwglProbeSession:
    now = datetime.now(timezone.utc)
    return HwglProbeSession(
        room_id=room_id,
        interval_seconds=60,
        duration_seconds=3600,
        status="running",
        started_at=started_at or now - timedelta(seconds=10),
        next_run_at=now - timedelta(seconds=1),
    )


def _db() -> tuple[object, sessionmaker]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return engine, factory


class FakeProbeClient:
    result = ElectricityQueryResult(
        success=True,
        balance=Decimal("18.25"),
        provider="hwgl",
        provider_updated_at=datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc),
        reported_daily_usage=Decimal("4.20"),
        power_status="正常供电",
    )

    def query_room(self, room: Room) -> ElectricityQueryResult:
        return self.result


def test_probe_summary_counts_unique_snapshots_without_extra_increment() -> None:
    engine, factory = _db()
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        probe = _session(room.id)
        db.add(probe)
        db.flush()
        db.add_all(
            [
                HwglProbeSample(
                    session_id=probe.id,
                    room_id=room.id,
                    requested_at=datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc),
                    received_at=datetime(2026, 8, 28, 12, 0, 1, tzinfo=timezone.utc),
                    balance=Decimal("18.25"),
                    response_hash="same",
                    success=True,
                    latency_ms=100,
                ),
                HwglProbeSample(
                    session_id=probe.id,
                    room_id=room.id,
                    requested_at=datetime(2026, 8, 28, 12, 1, tzinfo=timezone.utc),
                    received_at=datetime(2026, 8, 28, 12, 1, 1, tzinfo=timezone.utc),
                    balance=Decimal("18.25"),
                    response_hash="same",
                    success=True,
                    latency_ms=120,
                ),
                HwglProbeSample(
                    session_id=probe.id,
                    room_id=room.id,
                    requested_at=datetime(2026, 8, 28, 12, 2, tzinfo=timezone.utc),
                    received_at=datetime(2026, 8, 28, 12, 2, 1, tzinfo=timezone.utc),
                    balance=Decimal("18.10"),
                    response_hash="new",
                    success=True,
                    latency_ms=140,
                ),
            ]
        )
        db.flush()

        summary = hwgl_probe._summary(db, probe.id)

        assert summary["sample_count"] == 3
        assert summary["successful_samples"] == 3
        assert summary["unique_snapshot_count"] == 2
        assert summary["unchanged_response_ratio"] == 0.3333


def test_probe_job_persists_success_sample_but_not_normal_reading(monkeypatch) -> None:
    engine, factory = _db()
    monkeypatch.setattr(hwgl_probe, "SessionLocal", factory)
    monkeypatch.setattr(hwgl_probe, "HwglElectricityClient", FakeProbeClient)
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        probe = _session(room.id)
        db.add(probe)
        db.commit()
        probe_id = probe.id

    assert hwgl_probe.run_hwgl_probe_jobs(max_sessions=1) == 1

    with Session(engine, expire_on_commit=False) as db:
        probe = db.get(HwglProbeSession, probe_id)
        samples = list(db.scalars(select(HwglProbeSample).where(HwglProbeSample.session_id == probe_id)))
        readings = list(db.scalars(select(ElectricityReading)))
        assert probe is not None
        assert probe.status == "running"
        assert probe.sample_count == 1
        assert probe.unique_snapshot_count == 1
        assert len(samples) == 1
        assert samples[0].success is True
        assert samples[0].balance == Decimal("18.25")
        assert readings == []


def test_probe_job_keeps_failed_sample(monkeypatch) -> None:
    class FailingProbeClient:
        def query_room(self, room: Room) -> ElectricityQueryResult:
            return ElectricityQueryResult(
                success=False,
                provider="hwgl",
                error_kind="timeout",
                error_msg="upstream timed out",
            )

    engine, factory = _db()
    monkeypatch.setattr(hwgl_probe, "SessionLocal", factory)
    monkeypatch.setattr(hwgl_probe, "HwglElectricityClient", FailingProbeClient)
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        probe = _session(room.id)
        db.add(probe)
        db.commit()
        probe_id = probe.id

    assert hwgl_probe.run_hwgl_probe_jobs(max_sessions=1) == 1

    with Session(engine, expire_on_commit=False) as db:
        sample = db.scalar(select(HwglProbeSample).where(HwglProbeSample.session_id == probe_id))
        assert sample is not None
        assert sample.success is False
        assert sample.error_kind == "timeout"
        assert sample.error_msg == "upstream timed out"


def test_stopping_probe_generates_summary_and_keeps_status() -> None:
    engine, factory = _db()
    with Session(engine, expire_on_commit=False) as db:
        room = _room()
        db.add(room)
        db.flush()
        probe = _session(room.id)
        db.add(probe)
        db.flush()
        db.add(
            HwglProbeSample(
                session_id=probe.id,
                room_id=room.id,
                requested_at=datetime.now(timezone.utc),
                received_at=datetime.now(timezone.utc),
                balance=Decimal("18.25"),
                response_hash="snapshot",
                success=True,
                latency_ms=80,
            )
        )
        db.commit()

        stopped = hwgl_probe.stop_hwgl_probe(db, probe.id)

        assert stopped is not None
        assert stopped.status == "stopped"
        assert stopped.finished_at is not None
        assert stopped.sample_count == 1
        assert stopped.unique_snapshot_count == 1
        assert json.loads(stopped.summary_json or "{}")["sample_count"] == 1
