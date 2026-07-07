import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting
from app.schemas.appearance import AppearanceSettingsOut


APPEARANCE_SETTINGS_KEY = "appearance_settings"
APPEARANCE_DESCRIPTION = "Global frontend appearance settings"


def get_appearance_settings(db: Session) -> AppearanceSettingsOut:
    row = db.scalar(select(AppSetting).where(AppSetting.key == APPEARANCE_SETTINGS_KEY))
    if row is None:
        return AppearanceSettingsOut()
    try:
        payload = json.loads(row.value)
    except (TypeError, json.JSONDecodeError):
        payload = {}
    if payload.get("background_image_url") and not payload.get("light_background_image_url"):
        payload["light_background_image_url"] = payload["background_image_url"]
    if payload.get("light_background_image_url") and not payload.get("background_image_url"):
        payload["background_image_url"] = payload["light_background_image_url"]
    settings = AppearanceSettingsOut(**payload)
    settings.updated_at = row.updated_at
    return settings


def update_appearance_settings(db: Session, updates: dict) -> AppearanceSettingsOut:
    current = get_appearance_settings(db).model_dump(exclude={"updated_at"})
    if "background_image_url" in updates and "light_background_image_url" not in updates:
        updates["light_background_image_url"] = updates["background_image_url"]
    nullable_fields = {"background_image_url", "light_background_image_url", "dark_background_image_url"}
    current.update({key: value for key, value in updates.items() if value is not None or key in nullable_fields})
    if "light_background_image_url" in updates:
        current["background_image_url"] = updates["light_background_image_url"]
    normalized = AppearanceSettingsOut(**current)

    row = db.scalar(select(AppSetting).where(AppSetting.key == APPEARANCE_SETTINGS_KEY))
    if row is None:
        row = AppSetting(key=APPEARANCE_SETTINGS_KEY, value="", description=APPEARANCE_DESCRIPTION)
        db.add(row)

    row.value = normalized.model_dump_json(exclude={"updated_at"})
    row.description = APPEARANCE_DESCRIPTION
    db.commit()
    db.refresh(row)
    return get_appearance_settings(db)
