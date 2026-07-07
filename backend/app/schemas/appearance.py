from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


BackgroundPosition = Literal["top", "center", "bottom"]
GlassEffectMode = Literal["lite", "frosted", "liquid"]
DISALLOWED_BACKGROUND_SUFFIXES = (".gif", ".mp4", ".webm", ".mov", ".m4v", ".avi")


class AppearanceSettingsOut(BaseModel):
    background_image_url: str | None = Field(default=None, max_length=2048)
    light_background_image_url: str | None = Field(default=None, max_length=2048)
    dark_background_image_url: str | None = Field(default=None, max_length=2048)
    background_position: BackgroundPosition = "center"
    background_overlay_opacity: float = Field(default=0.42, ge=0.16, le=0.82)
    background_blur_px: int = Field(default=0, ge=0, le=18)
    glass_card_opacity: float = Field(default=0.62, ge=0.28, le=0.94)
    glass_blur_px: int = Field(default=10, ge=0, le=16)
    glass_effect_mode: GlassEffectMode = "lite"
    updated_at: datetime | None = None

    @field_validator("background_image_url")
    @classmethod
    def validate_background_image_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        is_local_upload = stripped.startswith("/uploads/")
        if not (stripped.startswith("http://") or stripped.startswith("https://") or stripped.startswith("data:image/") or is_local_upload):
            raise ValueError("background image must be http(s), data:image, or /uploads URL")
        lowered = stripped.split("?", 1)[0].split("#", 1)[0].lower()
        if lowered.endswith(DISALLOWED_BACKGROUND_SUFFIXES) or stripped.startswith("data:image/gif"):
            raise ValueError("animated or video backgrounds are not supported")
        return stripped

    @field_validator("light_background_image_url", "dark_background_image_url")
    @classmethod
    def validate_theme_background_image_url(cls, value: str | None) -> str | None:
        return cls.validate_background_image_url(value)


class AppearanceSettingsUpdate(BaseModel):
    background_image_url: str | None = Field(default=None, max_length=2048)
    light_background_image_url: str | None = Field(default=None, max_length=2048)
    dark_background_image_url: str | None = Field(default=None, max_length=2048)
    background_position: BackgroundPosition | None = None
    background_overlay_opacity: float | None = Field(default=None, ge=0.16, le=0.82)
    background_blur_px: int | None = Field(default=None, ge=0, le=18)
    glass_card_opacity: float | None = Field(default=None, ge=0.28, le=0.94)
    glass_blur_px: int | None = Field(default=None, ge=0, le=16)
    glass_effect_mode: GlassEffectMode | None = None

    @field_validator("background_image_url")
    @classmethod
    def validate_background_image_url(cls, value: str | None) -> str | None:
        return AppearanceSettingsOut.validate_background_image_url(value)

    @field_validator("light_background_image_url", "dark_background_image_url")
    @classmethod
    def validate_theme_background_image_url(cls, value: str | None) -> str | None:
        return AppearanceSettingsOut.validate_background_image_url(value)


class AppearanceBackgroundUploadOut(BaseModel):
    theme: Literal["light", "dark"]
    url: str
