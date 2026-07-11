from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.admin import list_users_page
from app.api.routes.admin_rooms import list_admin_room_readings, list_admin_rooms_page
from app.models.admin_user import AdminUser
from app.models.electricity_reading import ElectricityReading
from app.models.room import Room
from app.models.user import User
from app.models.user_room import UserRoom


def _room(number: str) -> Room:
    return Room(
        campus="示例校区",
        campus_param="demo-campus",
        building_key="demo-building",
        building_name="示例宿舍楼",
        building_param="demo-building-param",
        room_number=number,
    )


def test_admin_user_and_room_pages_filter_sort_and_count() -> None:
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    Room.__table__.create(engine)
    UserRoom.__table__.create(engine)
    ElectricityReading.__table__.create(engine)

    with Session(engine) as db:
        users = [
            User(email=f"user{index:02d}@example.com", password_hash="hash", is_verified=True)
            for index in range(12)
        ]
        rooms = [_room("A101"), _room("A102"), _room("A103")]
        db.add_all([*users, *rooms])
        db.flush()
        db.add_all(
            [
                UserRoom(user_id=users[0].id, room_id=rooms[0].id),
                UserRoom(user_id=users[1].id, room_id=rooms[0].id),
                UserRoom(user_id=users[0].id, room_id=rooms[1].id),
                UserRoom(user_id=users[2].id, room_id=rooms[2].id),
            ]
        )
        now = datetime.now()
        db.add_all(
            [
                ElectricityReading(room_id=rooms[0].id, balance=Decimal("18.50"), read_at=now - timedelta(hours=4)),
                ElectricityReading(room_id=rooms[0].id, balance=Decimal("16.25"), read_at=now),
            ]
        )
        db.commit()

        admin = AdminUser(username="admin", password_hash="hash", enabled=True)
        user_page = list_users_page(page=1, page_size=10, q=None, sort="rooms_desc", _=admin, db=db)
        filtered_users = list_users_page(page=1, page_size=10, q="user11", sort="email_asc", _=admin, db=db)
        room_page = list_admin_rooms_page(page=1, page_size=10, q=None, sort="bindings_desc", _=admin, db=db)
        balance_page = list_admin_rooms_page(page=1, page_size=10, q=None, sort="balance_desc", _=admin, db=db)
        filtered_rooms = list_admin_rooms_page(
            page=1,
            page_size=10,
            q="user02@example.com",
            sort="building_asc",
            _=admin,
            db=db,
        )
        readings = list_admin_room_readings(
            room_id=rooms[0].id,
            limit=500,
            days=None,
            start_at=None,
            end_at=None,
            _=admin,
            db=db,
        )

        assert user_page.total == 12
        assert user_page.total_pages == 2
        assert user_page.items[0].email == "user00@example.com"
        assert user_page.items[0].room_count == 2
        assert filtered_users.total == 1
        assert filtered_users.items[0].email == "user11@example.com"

        assert room_page.total == 3
        assert room_page.items[0].room.room_number == "A101"
        assert room_page.items[0].binding_count == 2
        assert room_page.items[0].latest_balance == Decimal("16.25")
        assert room_page.items[0].reading_count == 2
        assert balance_page.items[0].room.room_number == "A101"
        assert [reading.balance for reading in readings] == [Decimal("18.50"), Decimal("16.25")]
        assert filtered_rooms.total == 1
        assert filtered_rooms.items[0].room.room_number == "A103"
