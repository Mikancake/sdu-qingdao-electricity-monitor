from pathlib import Path

import pytest
from PIL import Image

from app.schemas.appearance import AppearanceSettingsUpdate
from app.services import appearance_assets
from app.services.appearance_assets import InvalidAppearanceImage, build_optimized_background, build_preblurred_background


def test_build_preblurred_background_creates_small_webp(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    destination = tmp_path / "blurred.webp"
    Image.new("RGB", (1600, 900), (32, 96, 180)).save(source)

    build_preblurred_background(source, destination)

    with Image.open(destination) as result:
        assert result.format == "WEBP"
        assert max(result.size) <= 720


def test_build_optimized_background_creates_display_webp(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    destination = tmp_path / "display.webp"
    Image.new("RGB", (3200, 1800), (24, 72, 140)).save(source)

    build_optimized_background(source, destination)

    with Image.open(destination) as result:
        assert result.format == "WEBP"
        assert max(result.size) <= 2560


def test_build_preblurred_background_rejects_non_image(tmp_path: Path) -> None:
    source = tmp_path / "not-an-image.png"
    source.write_text("not an image", encoding="utf-8")

    with pytest.raises(InvalidAppearanceImage):
        build_preblurred_background(source, tmp_path / "blurred.webp")


def test_build_preblurred_background_rejects_excessive_dimensions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "oversized.png"
    Image.new("RGB", (11, 10), (32, 96, 180)).save(source)
    monkeypatch.setattr(appearance_assets, "MAX_IMAGE_PIXELS", 100)

    with pytest.raises(InvalidAppearanceImage, match="dimensions"):
        build_preblurred_background(source, tmp_path / "blurred.webp")


def test_appearance_rejects_svg_data_urls() -> None:
    with pytest.raises(ValueError):
        AppearanceSettingsUpdate(background_image_url="data:image/svg+xml,<svg></svg>")
