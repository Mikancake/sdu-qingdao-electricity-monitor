from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import current_admin, db_session
from app.api.routes.admin_common import audit
from app.core.config import settings
from app.models.admin_user import AdminUser
from app.schemas.appearance import AppearanceBackgroundUploadOut, AppearanceSettingsOut, AppearanceSettingsUpdate
from app.services.appearance import get_appearance_settings, update_appearance_settings
from app.services.appearance_assets import InvalidAppearanceImage, build_optimized_background, build_preblurred_background


router = APIRouter()
APPEARANCE_URL_FIELDS = {
    "background_image_url",
    "light_background_image_url",
    "dark_background_image_url",
    "light_background_blurred_url",
    "dark_background_blurred_url",
}
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


@router.get("/appearance", response_model=AppearanceSettingsOut)
def get_admin_appearance_settings(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceSettingsOut:
    return get_appearance_settings(db)


@router.patch("/appearance", response_model=AppearanceSettingsOut)
def patch_admin_appearance_settings(
    payload: AppearanceSettingsUpdate,
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceSettingsOut:
    previous = get_appearance_settings(db)
    appearance = update_appearance_settings(db, payload.model_dump(exclude_unset=True))
    audit(
        db,
        admin,
        "update_appearance_settings",
        "app_settings",
        "appearance_settings",
        {"fields": list(payload.model_fields_set)},
    )
    db.commit()
    _remove_unreferenced_appearance_files(previous, appearance)
    return appearance


@router.post("/appearance/background", response_model=AppearanceBackgroundUploadOut)
async def upload_appearance_background(
    theme: Literal["light", "dark"] = Form(default="light"),
    file: UploadFile = File(...),
    admin: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AppearanceBackgroundUploadOut:
    suffix = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(status_code=400, detail="only jpg, png, webp, and avif images are supported")

    upload_root = Path(settings.upload_dir) / "appearance"
    upload_root.mkdir(parents=True, exist_ok=True)
    source_filename = f"{theme}-{uuid4().hex}{suffix}"
    filename = f"{theme}-{uuid4().hex}.webp"
    blurred_filename = f"{theme}-{uuid4().hex}-blurred.webp"
    source_target = upload_root / source_filename
    target = upload_root / filename
    blurred_target = upload_root / blurred_filename

    written = 0
    try:
        with source_target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > settings.appearance_upload_max_bytes:
                    raise HTTPException(status_code=413, detail="image is too large")
                handle.write(chunk)
        await run_in_threadpool(build_optimized_background, source_target, target)
        await run_in_threadpool(build_preblurred_background, source_target, blurred_target)
    except InvalidAppearanceImage as exc:
        _remove_uploads(source_target, target, blurred_target)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        _remove_uploads(source_target, target, blurred_target)
        raise
    finally:
        await file.close()
        _remove_uploads(source_target)

    url = f"/uploads/appearance/{filename}"
    blurred_url = f"/uploads/appearance/{blurred_filename}"
    audit(
        db,
        admin,
        "upload_appearance_background",
        "app_settings",
        "appearance_settings",
        {"theme": theme, "url": url, "blurred_url": blurred_url},
    )
    db.commit()
    return AppearanceBackgroundUploadOut(theme=theme, url=url, blurred_url=blurred_url)


def _remove_uploads(*paths: Path) -> None:
    for path in paths:
        if path.exists():
            path.unlink()


def _remove_unreferenced_appearance_files(
    previous: AppearanceSettingsOut,
    current: AppearanceSettingsOut,
) -> None:
    previous_urls = {getattr(previous, field) for field in APPEARANCE_URL_FIELDS}
    current_urls = {getattr(current, field) for field in APPEARANCE_URL_FIELDS}
    for url in previous_urls - current_urls:
        path = _local_appearance_path(url)
        if path is None:
            continue
        try:
            path.unlink(missing_ok=True)
        except OSError:
            continue


def _local_appearance_path(url: str | None) -> Path | None:
    prefix = "/uploads/appearance/"
    if not url or not url.startswith(prefix):
        return None
    filename = url[len(prefix) :].split("?", 1)[0].split("#", 1)[0]
    if not filename or Path(filename).name != filename:
        return None
    upload_root = (Path(settings.upload_dir) / "appearance").resolve()
    candidate = (upload_root / filename).resolve()
    if candidate.parent != upload_root:
        return None
    return candidate
