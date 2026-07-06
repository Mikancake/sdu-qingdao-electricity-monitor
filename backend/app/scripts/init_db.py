from app.db.schema import create_schema
from app.db.session import engine
from app.db.base import Base


def main() -> int:
    create_schema(engine)
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"database ready: {tables}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
