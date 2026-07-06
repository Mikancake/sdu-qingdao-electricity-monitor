from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.schema import create_schema
from app.db.session import engine


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.debug)
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.on_event("startup")
    def create_dev_tables() -> None:
        # MVP convenience: Alembic migrations will replace this once the schema settles.
        create_schema(engine)

    return app


app = create_app()
