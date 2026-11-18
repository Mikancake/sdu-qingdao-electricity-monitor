from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings, validate_runtime_safety
from app.core.http_security import RequestBodyLimitMiddleware, SecurityHeadersMiddleware, resolve_trusted_hosts


async def request_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's `input` can be the whole body (e.g. a missing field in a
    # login form); it does not belong in an error returned to the client.
    detail = [{key: err[key] for key in ("loc", "msg", "type")} for err in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": detail})


def create_app() -> FastAPI:
    validate_runtime_safety()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )
    app.add_exception_handler(RequestValidationError, request_validation_error)
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    app.add_middleware(
        RequestBodyLimitMiddleware,
        default_max_bytes=settings.max_request_body_bytes,
        appearance_upload_max_bytes=settings.appearance_upload_max_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type", "Origin", "X-Requested-With"],
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=resolve_trusted_hosts(settings.trusted_hosts, settings.cors_origins, debug=settings.debug),
    )
    if settings.security_headers_enabled:
        app.add_middleware(SecurityHeadersMiddleware, strict_csp=not settings.debug)
    app.include_router(api_router)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    return app


app = create_app()
