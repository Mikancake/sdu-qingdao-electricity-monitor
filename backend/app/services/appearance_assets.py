from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError


MAX_IMAGE_PIXELS = 40_000_000
PREBLUR_MAX_EDGE = 720
PREBLUR_RADIUS = 18
DISPLAY_MAX_EDGE = 2560


class InvalidAppearanceImage(ValueError):
    pass


def build_preblurred_background(source: Path, destination: Path) -> None:
    try:
        with Image.open(source) as opened:
            width, height = opened.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise InvalidAppearanceImage("image dimensions are too large")
            opened.verify()
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            image.thumbnail((PREBLUR_MAX_EDGE, PREBLUR_MAX_EDGE), Image.Resampling.LANCZOS)
            image = ImageEnhance.Color(image).enhance(1.08)
            image = image.filter(ImageFilter.GaussianBlur(PREBLUR_RADIUS))
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, format="WEBP", quality=72, method=4)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        raise InvalidAppearanceImage("invalid or unsupported image") from exc


def build_optimized_background(source: Path, destination: Path) -> None:
    try:
        with Image.open(source) as opened:
            width, height = opened.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise InvalidAppearanceImage("image dimensions are too large")
            opened.verify()
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            image.thumbnail((DISPLAY_MAX_EDGE, DISPLAY_MAX_EDGE), Image.Resampling.LANCZOS)
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, format="WEBP", quality=84, method=5)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        raise InvalidAppearanceImage("invalid or unsupported image") from exc
