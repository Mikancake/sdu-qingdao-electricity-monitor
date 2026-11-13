from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, inspect, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import current_admin, db_session
from app.models.admin_user import AdminUser
from app.models.electricity_reading import ElectricityReading
from app.models.electricity_recharge import ElectricityRecharge
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom
from app.schemas.admin import AdminRoomBindingOut, AdminRoomOut, AdminRoomPageOut
from app.electricity.provider import HWGL_PROVIDER
from app.schemas.reading import ElectricityReadingOut, ElectricityRechargeOut
from app.services.usage import list_room_readings


router = APIRouter()


def _admin_room_out(
    room: Room,
    *,
    latest_balance: Decimal | None = None,
    latest_read_at: datetime | None = None,
    latest_provider_updated_at: datetime | None = None,
    latest_reported_daily_usage: Decimal | None = None,
    latest_reported_usage_date: date | None = None,
    latest_power_status: str | None = None,
    latest_free_electricity: Decimal | None = None,
    latest_paid_electricity: Decimal | None = None,
    latest_arrears_electricity: Decimal | None = None,
    latest_electricity_price: Decimal | None = None,
    latest_estimated_amount: Decimal | None = None,
    reading_count: int = 0,
    recent_recharges: list[ElectricityRecharge] | None = None,
) -> AdminRoomOut:
    bindings = sorted(room.user_rooms, key=lambda item: item.id)
    return AdminRoomOut(
        room=room,
        binding_count=len(bindings),
        bindings=[
            AdminRoomBindingOut(
                binding_id=binding.id,
                user_id=binding.user_id,
                email=binding.user.email if binding.user else "",
                notification_email=binding.user.notification_email if binding.user else None,
                notification_email_verified=binding.user.notification_email_verified if binding.user else False,
                enabled=binding.enabled,
                created_at=binding.created_at,
            )
            for binding in bindings
        ],
        latest_balance=latest_balance,
        latest_read_at=latest_read_at,
        latest_provider_updated_at=latest_provider_updated_at,
        latest_reported_daily_usage=latest_reported_daily_usage,
        latest_reported_usage_date=latest_reported_usage_date,
        latest_power_status=latest_power_status,
        latest_free_electricity=latest_free_electricity,
        latest_paid_electricity=latest_paid_electricity,
        latest_arrears_electricity=latest_arrears_electricity,
        latest_electricity_price=latest_electricity_price,
        latest_estimated_amount=latest_estimated_amount,
        reading_count=reading_count,
        recent_recharges=list(recent_recharges or []),
    )


def _load_admin_rooms(db: Session, room_ids: list[int]) -> list[AdminRoomOut]:
    if not room_ids:
        return []
    rooms = list(
        db.scalars(
            select(Room)
            .options(selectinload(Room.user_rooms).selectinload(UserRoom.user))
            .where(Room.id.in_(room_ids))
        )
    )
    by_id = {room.id: room for room in rooms}
    ranked_readings = (
        select(
            ElectricityReading.room_id.label("room_id"),
            ElectricityReading.balance.label("balance"),
            ElectricityReading.read_at.label("read_at"),
            ElectricityReading.provider_updated_at.label("provider_updated_at"),
            ElectricityReading.reported_daily_usage.label("reported_daily_usage"),
            ElectricityReading.reported_usage_date.label("reported_usage_date"),
            ElectricityReading.power_status.label("power_status"),
            ElectricityReading.free_electricity.label("free_electricity"),
            ElectricityReading.paid_electricity.label("paid_electricity"),
            ElectricityReading.arrears_electricity.label("arrears_electricity"),
            ElectricityReading.electricity_price.label("electricity_price"),
            ElectricityReading.estimated_amount.label("estimated_amount"),
            func.count(ElectricityReading.id).over(partition_by=ElectricityReading.room_id).label("reading_count"),
            func.row_number()
            .over(
                partition_by=ElectricityReading.room_id,
                order_by=(
                    func.coalesce(ElectricityReading.provider_updated_at, ElectricityReading.read_at).desc(),
                    ElectricityReading.read_at.desc(),
                    ElectricityReading.id.desc(),
                ),
            )
            .label("position"),
        )
        .join(Room, Room.id == ElectricityReading.room_id)
        .where(
            ElectricityReading.room_id.in_(room_ids),
            ElectricityReading.provider == Room.provider,
        )
        .subquery()
    )
    reading_rows = db.execute(
        select(
            ranked_readings.c.room_id,
            ranked_readings.c.balance,
            ranked_readings.c.read_at,
            ranked_readings.c.provider_updated_at,
            ranked_readings.c.reported_daily_usage,
            ranked_readings.c.reported_usage_date,
            ranked_readings.c.power_status,
            ranked_readings.c.free_electricity,
            ranked_readings.c.paid_electricity,
            ranked_readings.c.arrears_electricity,
            ranked_readings.c.electricity_price,
            ranked_readings.c.estimated_amount,
            ranked_readings.c.reading_count,
        ).where(ranked_readings.c.position == 1)
    )
    reading_by_room = {
        int(row.room_id): (
            row.balance,
            row.read_at,
            row.provider_updated_at,
            row.reported_daily_usage,
            row.reported_usage_date,
            row.power_status,
            row.free_electricity,
            row.paid_electricity,
            row.arrears_electricity,
            row.electricity_price,
            row.estimated_amount,
            int(row.reading_count or 0),
        )
        for row in reading_rows
    }
    recharge_by_room: dict[int, list[ElectricityRecharge]] = {}
    if room_ids and inspect(db.get_bind()).has_table(ElectricityRecharge.__tablename__):
        recharge_rows = db.scalars(
            select(ElectricityRecharge)
            .where(
                ElectricityRecharge.room_id.in_(room_ids),
                ElectricityRecharge.provider == HWGL_PROVIDER,
            )
            .order_by(ElectricityRecharge.paid_at.desc(), ElectricityRecharge.id.desc())
        )
        for recharge in recharge_rows:
            bucket = recharge_by_room.setdefault(recharge.room_id, [])
            if len(bucket) < 8:
                bucket.append(recharge)
    items: list[AdminRoomOut] = []
    for room_id in room_ids:
        room = by_id.get(room_id)
        if room is None:
            continue
        (
            latest_balance,
            latest_read_at,
            latest_provider_updated_at,
            latest_reported_daily_usage,
            latest_reported_usage_date,
            latest_power_status,
            latest_free_electricity,
            latest_paid_electricity,
            latest_arrears_electricity,
            latest_electricity_price,
            latest_estimated_amount,
            reading_count,
        ) = reading_by_room.get(room_id, (None, None, None, None, None, None, None, None, None, None, None, 0))
        items.append(
            _admin_room_out(
                room,
                latest_balance=latest_balance,
                latest_read_at=latest_read_at,
                latest_provider_updated_at=latest_provider_updated_at,
                latest_reported_daily_usage=latest_reported_daily_usage,
                latest_reported_usage_date=latest_reported_usage_date,
                latest_power_status=latest_power_status,
                latest_free_electricity=latest_free_electricity,
                latest_paid_electricity=latest_paid_electricity,
                latest_arrears_electricity=latest_arrears_electricity,
                latest_electricity_price=latest_electricity_price,
                latest_estimated_amount=latest_estimated_amount,
                reading_count=reading_count,
                recent_recharges=recharge_by_room.get(room_id),
            )
        )
    return items


@router.get("/rooms", response_model=list[AdminRoomOut])
def list_admin_rooms(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[AdminRoomOut]:
    room_ids = list(
        db.scalars(
            select(Room.id)
            .join(UserRoom, UserRoom.room_id == Room.id)
            .distinct()
            .order_by(Room.building_name, Room.room_number, Room.id)
        )
    )
    return _load_admin_rooms(db, room_ids)


@router.get("/rooms/page", response_model=AdminRoomPageOut)
def list_admin_rooms_page(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=10, le=100),
    q: str | None = Query(default=None, max_length=120),
    sort: str = Query(default="newest_desc", pattern="^(newest|building|bindings|balance)_(asc|desc)$"),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminRoomPageOut:
    keyword = (q or "").strip()
    matching_ids = select(Room.id).join(UserRoom, UserRoom.room_id == Room.id).join(User, User.id == UserRoom.user_id)
    if keyword:
        pattern = f"%{keyword}%"
        search_terms = [
            Room.campus.ilike(pattern),
            Room.building_name.ilike(pattern),
            Room.room_number.ilike(pattern),
            User.email.ilike(pattern),
            User.notification_email.ilike(pattern),
        ]
        if keyword.isdigit():
            search_terms.append(Room.id == int(keyword))
        if keyword in {"启用", "正常"}:
            search_terms.append(UserRoom.enabled.is_(True))
        if keyword in {"停用", "禁用"}:
            search_terms.append(UserRoom.enabled.is_(False))
        matching_ids = matching_ids.where(or_(*search_terms))
    matching_ids = matching_ids.distinct().subquery()

    total = int(db.scalar(select(func.count()).select_from(matching_ids)) or 0)
    binding_count = func.count(UserRoom.id)
    newest_binding = func.max(UserRoom.created_at)
    latest_balance = (
        select(ElectricityReading.balance)
        .where(
            ElectricityReading.room_id == Room.id,
            ElectricityReading.provider == Room.provider,
        )
        .order_by(ElectricityReading.read_at.desc(), ElectricityReading.id.desc())
        .limit(1)
        .correlate(Room)
        .scalar_subquery()
    )
    order_columns = {
        "newest_asc": (newest_binding.asc(), Room.id.asc()),
        "newest_desc": (newest_binding.desc(), Room.id.desc()),
        "building_asc": (Room.building_name.asc(), Room.room_number.asc(), Room.id.asc()),
        "building_desc": (Room.building_name.desc(), Room.room_number.desc(), Room.id.desc()),
        "bindings_asc": (binding_count.asc(), Room.id.asc()),
        "bindings_desc": (binding_count.desc(), Room.id.desc()),
        "balance_asc": (latest_balance.is_(None).asc(), latest_balance.asc(), Room.id.asc()),
        "balance_desc": (latest_balance.is_(None).asc(), latest_balance.desc(), Room.id.desc()),
    }
    rows = db.execute(
        select(Room.id, binding_count.label("binding_count"), newest_binding.label("newest_binding"))
        .join(matching_ids, matching_ids.c.id == Room.id)
        .join(UserRoom, UserRoom.room_id == Room.id)
        .group_by(Room.id)
        .order_by(*order_columns[sort])
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    room_ids = [int(row.id) for row in rows]
    return AdminRoomPageOut(
        items=_load_admin_rooms(db, room_ids),
        page=page,
        page_size=page_size,
        total=total,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/rooms/{room_id}/readings", response_model=list[ElectricityReadingOut])
def list_admin_room_readings(
    room_id: int,
    limit: int = Query(default=500, ge=1, le=5000),
    days: int | None = Query(default=None, ge=1, le=365),
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[ElectricityReading]:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")
    effective_days = None if start_at or end_at else days
    return list_room_readings(
        db,
        room_id,
        provider=room.provider,
        days=effective_days,
        start_at=start_at,
        end_at=end_at,
        limit=limit,
        ascending=True,
    )


@router.get("/rooms/{room_id}/recharges", response_model=list[ElectricityRechargeOut])
def list_admin_room_recharges(
    room_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    days: int | None = Query(default=None, ge=1, le=730),
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> list[ElectricityRecharge]:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")
    if room.provider != HWGL_PROVIDER:
        return []
    if not inspect(db.get_bind()).has_table(ElectricityRecharge.__tablename__):
        return []
    stmt = (
        select(ElectricityRecharge)
        .where(
            ElectricityRecharge.room_id == room_id,
            ElectricityRecharge.provider == HWGL_PROVIDER,
        )
        .order_by(ElectricityRecharge.paid_at.desc(), ElectricityRecharge.id.desc())
        .limit(limit)
    )
    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = stmt.where(
            (ElectricityRecharge.paid_at.is_(None)) | (ElectricityRecharge.paid_at >= cutoff)
        )
    return list(db.scalars(stmt))
