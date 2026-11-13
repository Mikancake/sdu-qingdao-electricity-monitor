import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import current_admin, db_session
from app.api.routes.admin_common import audit
from app.core.config import settings
from app.electricity.buildings import (
    DEFAULT_CAMPUS,
    DEFAULT_CAMPUS_PARAM,
    HWGL_CAMPUS,
    HWGL_MERGED_BUILDING_KEY,
    HWGL_MERGED_BUILDING_NAME,
    HWGL_MERGED_BUILDING_PARAM,
)
from app.electricity.hwgl_client import HwglClientError, HwglElectricityClient
from app.models.admin_user import AdminUser
from app.models.hwgl_probe import HwglProbeSession
from app.models.room import Room
from app.schemas.admin import HwglProbeDetailOut, HwglProbeSampleOut, HwglProbeSessionOut, HwglProbeStartRequest
from app.schemas.room import RoomOut
from app.services.hwgl_probe import stop_hwgl_probe
from app.services.rooms import normalize_room_number
from app.services.runtime_settings import get_runtime_config


router = APIRouter()
MIN_PROBE_INTERVAL_SECONDS = 60
MAX_PROBE_INTERVAL_SECONDS = 60 * 60
PROBE_BUILDINGS_BY_SIDE = {
    "11": "凤凰居11公寓",
    "13": "凤凰居13公寓",
}


@router.get("/hwgl-rooms", response_model=list[RoomOut])
def list_hwgl_rooms(
    limit: int = Query(default=5000, ge=1, le=10000),
    q: str | None = Query(default=None, max_length=120),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[Room]:
    stmt = select(Room).where(Room.provider == "hwgl").order_by(Room.building_name, Room.room_number, Room.id).limit(limit)
    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{keyword}%"
        stmt = stmt.where(
            Room.campus.ilike(pattern)
            | Room.building_name.ilike(pattern)
            | Room.room_number.ilike(pattern)
        )
    return list(db.scalars(stmt))


def _summary_value(session: HwglProbeSession) -> dict[str, object] | None:
    if not session.summary_json:
        return None
    try:
        value = json.loads(session.summary_json)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _session_out(session: HwglProbeSession) -> HwglProbeSessionOut:
    if session.room is None:
        raise HTTPException(status_code=500, detail="probe room is missing")
    return HwglProbeSessionOut(
        id=session.id,
        room_id=session.room_id,
        interval_seconds=session.interval_seconds,
        duration_seconds=session.duration_seconds,
        status=session.status,
        started_at=session.started_at,
        next_run_at=session.next_run_at,
        finished_at=session.finished_at,
        sample_count=session.sample_count,
        unique_snapshot_count=session.unique_snapshot_count,
        summary=_summary_value(session),
        room=session.room,
    )


@router.get("/hwgl-probes", response_model=list[HwglProbeSessionOut])
def list_hwgl_probes(
    limit: int = Query(default=20, ge=1, le=100),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[HwglProbeSessionOut]:
    sessions = list(
        db.scalars(
            select(HwglProbeSession)
            .options(selectinload(HwglProbeSession.room))
            .order_by(HwglProbeSession.created_at.desc(), HwglProbeSession.id.desc())
            .limit(limit)
        )
    )
    return [_session_out(session) for session in sessions]


@router.get("/hwgl-probes/{probe_id}", response_model=HwglProbeDetailOut)
def get_hwgl_probe(
    probe_id: int,
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> HwglProbeDetailOut:
    session = db.scalar(
        select(HwglProbeSession)
        .options(selectinload(HwglProbeSession.room), selectinload(HwglProbeSession.samples))
        .where(HwglProbeSession.id == probe_id)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="probe not found")
    base = _session_out(session)
    return HwglProbeDetailOut(
        **base.model_dump(),
        samples=[HwglProbeSampleOut.model_validate(sample) for sample in session.samples],
    )


def _resolve_custom_probe_room(db: Session, payload: HwglProbeStartRequest) -> Room:
    """Resolve an administrator-entered room and persist it as probe-only.

    The probe worker stores samples through the existing ``rooms`` foreign key,
    so a custom target needs a small room row.  Marking it ``probe_only`` keeps
    it out of the public room directory and normal worker/metadata sync.  If a
    real user later binds the same location, the binding flow promotes the row
    to a normal room instead of creating a duplicate.
    """
    room_number = normalize_room_number(payload.room_number)
    if not room_number:
        raise HTTPException(status_code=422, detail="custom probe room_number cannot be empty")

    provider_building = PROBE_BUILDINGS_BY_SIDE.get(payload.building_side)
    candidate = Room(
        campus=DEFAULT_CAMPUS,
        campus_param=DEFAULT_CAMPUS_PARAM,
        building_key=HWGL_MERGED_BUILDING_KEY,
        building_name=HWGL_MERGED_BUILDING_NAME,
        building_param=HWGL_MERGED_BUILDING_PARAM,
        room_number=room_number,
        provider="hwgl",
        provider_campus=HWGL_CAMPUS,
        provider_building=provider_building,
        probe_only=True,
    )
    try:
        resolved = HwglElectricityClient().resolve_room(candidate, force_directory=True)
    except HwglClientError as exc:
        if exc.kind == "room_not_found":
            raise HTTPException(status_code=422, detail="HWGL 宿舍目录中没有找到这个宿舍，请检查房间号") from exc
        if exc.kind == "room_ambiguous":
            raise HTTPException(
                status_code=422,
                detail="这个房间号在上游目录中对应多个电表，请在‘楼侧’中选择 11 侧或 13 侧",
            ) from exc
        raise HTTPException(status_code=502, detail=f"无法验证测试宿舍：{exc.message}") from exc

    room = db.scalar(
        select(Room).where(
            Room.campus_param == candidate.campus_param,
            Room.building_param == candidate.building_param,
            Room.room_number == candidate.room_number,
        )
    )
    if room is None:
        room = candidate
        db.add(room)
    elif room.provider != "hwgl":
        raise HTTPException(status_code=409, detail="这个位置已经存在一个非 HWGL 宿舍记录")

    room.provider = "hwgl"
    room.provider_room_key = resolved.room_key
    room.provider_line_id = resolved.line_id
    room.provider_campus = resolved.campus
    room.provider_building = resolved.building
    room.provider_floor = resolved.floor
    # Retain the public merged building name and mark newly-created rows as
    # isolated targets.
    if room is candidate:
        room.probe_only = True
    return room


@router.post("/hwgl-probes", response_model=HwglProbeSessionOut, status_code=status.HTTP_201_CREATED)
def create_hwgl_probe(
    payload: HwglProbeStartRequest,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> HwglProbeSessionOut:
    if not MIN_PROBE_INTERVAL_SECONDS <= payload.interval_seconds <= MAX_PROBE_INTERVAL_SECONDS:
        raise HTTPException(
            status_code=422,
            detail=f"interval_seconds must be between {MIN_PROBE_INTERVAL_SECONDS} and {MAX_PROBE_INTERVAL_SECONDS} seconds",
        )
    runtime = get_runtime_config(db)
    max_duration_seconds = min(runtime.hwgl_probe_max_duration_seconds, settings.hwgl_probe_max_duration_seconds)
    if payload.duration_seconds > max_duration_seconds:
        raise HTTPException(
            status_code=422,
            detail=f"duration_seconds cannot exceed {max_duration_seconds} seconds",
        )
    active_count = db.scalar(
        select(HwglProbeSession.id).where(HwglProbeSession.status == "running").limit(1)
    )
    if active_count is not None:
        raise HTTPException(status_code=409, detail="another HWGL probe is already running")

    has_room_id = payload.room_id is not None
    has_custom_room = bool((payload.room_number or "").strip())
    if has_room_id == has_custom_room:
        raise HTTPException(status_code=422, detail="choose an existing room_id or provide a custom room_number")
    if has_room_id:
        if payload.building_side != "auto":
            raise HTTPException(status_code=422, detail="building_side is only available for a custom room")
        room = db.get(Room, payload.room_id)
        if room is None:
            raise HTTPException(status_code=404, detail="room not found")
        if room.provider != "hwgl":
            raise HTTPException(status_code=422, detail="freshness probes require a room that uses the HWGL provider")
    else:
        room = _resolve_custom_probe_room(db, payload)

    # A custom target may have just been inserted.  Flush before copying the
    # room id into the probe session's foreign key.
    db.flush()
    now = datetime.now(timezone.utc)
    session = HwglProbeSession(
        room_id=room.id,
        admin_id=admin.id,
        interval_seconds=payload.interval_seconds,
        duration_seconds=payload.duration_seconds,
        status="running",
        started_at=now,
        next_run_at=now,
    )
    db.add(session)
    db.flush()
    audit(
        db,
        admin,
        "start_hwgl_probe",
        "hwgl_probe",
        session.id,
        {"room_id": room.id, "interval_seconds": payload.interval_seconds, "duration_seconds": payload.duration_seconds},
    )
    db.commit()
    session = db.scalar(
        select(HwglProbeSession).options(selectinload(HwglProbeSession.room)).where(HwglProbeSession.id == session.id)
    )
    if session is None:
        raise HTTPException(status_code=500, detail="probe was not saved")
    return _session_out(session)


@router.post("/hwgl-probes/{probe_id}/stop", response_model=HwglProbeSessionOut)
def stop_probe(
    probe_id: int,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> HwglProbeSessionOut:
    session = stop_hwgl_probe(db, probe_id)
    if session is None:
        raise HTTPException(status_code=404, detail="probe not found")
    audit(db, admin, "stop_hwgl_probe", "hwgl_probe", session.id, {"status": session.status})
    db.commit()
    session = db.scalar(
        select(HwglProbeSession).options(selectinload(HwglProbeSession.room)).where(HwglProbeSession.id == probe_id)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="probe not found")
    return _session_out(session)
