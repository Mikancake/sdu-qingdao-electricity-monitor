import argparse
import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.schema import create_schema
from app.db.session import SessionLocal, engine
from app.models.admin_user import AdminUser
from app.services.admins import normalize_username


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create or reset an admin account.")
    parser.add_argument("username", help="Admin username")
    parser.add_argument("--display-name", default=None, help="Admin display name")
    parser.add_argument("--reset-password", action="store_true", help="Reset password if the admin already exists")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    username = normalize_username(args.username)
    password = getpass.getpass("Admin password: ")
    if len(password) < 8:
        print("password must be at least 8 characters")
        return 1

    create_schema(engine, ensure_admin=False)
    with SessionLocal() as db:
        admin = db.scalar(select(AdminUser).where(AdminUser.username == username))
        if admin is not None and not args.reset_password:
            print("admin already exists; pass --reset-password to update it")
            return 1
        if admin is None:
            admin = AdminUser(username=username, password_hash=hash_password(password), display_name=args.display_name)
            db.add(admin)
            action = "created"
        else:
            admin.password_hash = hash_password(password)
            if args.display_name is not None:
                admin.display_name = args.display_name
            admin.enabled = True
            action = "updated"
        db.commit()
    print(f"admin {action}: {username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
