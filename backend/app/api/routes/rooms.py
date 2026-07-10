from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.schemas.reading import ElectricityReadingOut
from app.schemas.room import RoomCreate, RoomOut, RoomSummaryOut
from app.services.room_checks import check_and_store_room
from app.services.rooms import RoomInputError, normalize_room_data
from app.services.usage import list_room_readings


router = APIRouter()


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(payload: RoomCreate, db: Session = Depends(db_session)) -> Room:
    try:
        room_data = normalize_room_data(payload.model_dump())
    except RoomInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    room = Room(**room_data)
    db.add(room)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="room already exists") from exc
    db.refresh(room)
    return room


@router.get("", response_model=list[RoomOut])
def list_rooms(db: Session = Depends(db_session)) -> list[Room]:
    return list(db.scalars(select(Room).order_by(Room.id)))


@router.post("/{room_id}/check", response_model=ElectricityReadingOut)
def check_room(room_id: int, db: Session = Depends(db_session)) -> ElectricityReading:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")

    outcome = check_and_store_room(db, room, source="manual")
    if not outcome.success or outcome.reading_id is None:
        raise HTTPException(status_code=502, detail={"kind": outcome.error_kind, "message": outcome.error_msg})
    reading = db.get(ElectricityReading, outcome.reading_id)
    if reading is None:
        raise HTTPException(status_code=500, detail="reading was not saved")
    return reading


@router.get("/{room_id}/summary", response_model=RoomSummaryOut)
def get_room_summary(
    room_id: int,
    limit: int = Query(default=12, ge=1, le=100),
    db: Session = Depends(db_session),
) -> RoomSummaryOut:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")

    readings = list_room_readings(db, room_id, limit=limit, ascending=False)
    reading_count = db.scalar(
        select(func.count(ElectricityReading.id)).where(ElectricityReading.room_id == room_id)
    )
    latest = readings[0] if readings else None
    return RoomSummaryOut(
        room_id=room.id,
        location=f"{room.campus} {room.building_name} {room.room_number}",
        latest_balance=latest.balance if latest else None,
        latest_read_at=latest.read_at if latest else None,
        reading_count=reading_count or 0,
        recent_readings=readings,
    )


@router.get("/{room_id}/readings", response_model=list[ElectricityReadingOut])
def list_readings(
    room_id: int,
    limit: int = Query(default=100, ge=1, le=1000),
    days: int | None = Query(default=None, ge=1, le=365),
    db: Session = Depends(db_session),
) -> list[ElectricityReading]:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")

    return list_room_readings(db, room_id, days=days, limit=limit, ascending=False)
