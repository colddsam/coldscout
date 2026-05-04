"""
One-off generator for Android status-bar notification icons.

Reads the source app logo (frontend/assets/logo.png), converts it to a
pure white silhouette on a transparent background (Material Design
requirement for status-bar icons on Android 5+), and writes the icon
into every density bucket Android expects:

  drawable-mdpi    24x24
  drawable-hdpi    36x36
  drawable-xhdpi   48x48
  drawable-xxhdpi  72x72
  drawable-xxxhdpi 96x96

Run from the backend venv (which already has Pillow):

    backend/venv/Scripts/python.exe \
        frontend/android/app/src/main/generate_notification_icon.py
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageOps


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent.parent.parent.parent / "assets" / "logo.png"
RES_DIR = HERE / "res"

# Density bucket → output edge length in pixels. Material Design's
# notification icon spec is 24dp; one dp == 1px @ mdpi, scaling up from there.
BUCKETS = {
    "drawable-mdpi": 24,
    "drawable-hdpi": 36,
    "drawable-xhdpi": 48,
    "drawable-xxhdpi": 72,
    "drawable-xxxhdpi": 96,
}


def to_white_silhouette(src: Image.Image) -> Image.Image:
    """Build a transparent-background, white-foreground silhouette.

    Source logo has an opaque white background, so an alpha-channel mask
    would cover the entire canvas. Instead, we treat every non-white
    pixel (luminance below threshold) as the silhouette and discard the
    rest. This produces the flat, single-color icon Android requires for
    the status bar (the OS tints it on newer versions).
    """
    if src.mode != "RGBA":
        src = src.convert("RGBA")
    # Composite onto white so any partial transparency is resolved before
    # we threshold by luminance.
    bg = Image.new("RGBA", src.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(bg, src).convert("L")
    # Pixels darker than ~220/255 belong to the icon shape.
    mask = flat.point(lambda v: 255 if v < 220 else 0)
    out = Image.new("RGBA", src.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source icon not found: {SOURCE}")

    src = Image.open(SOURCE)
    silhouette = to_white_silhouette(src)

    # Trim to content so the silhouette uses the full canvas of each
    # output. ImageOps.invert needs RGB; trim by alpha bbox instead.
    bbox = silhouette.getbbox()
    if bbox:
        silhouette = silhouette.crop(bbox)

    for folder, edge in BUCKETS.items():
        out_dir = RES_DIR / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        # Pad on a square canvas so the icon isn't squished if the source
        # isn't square. The OS centres the rendered icon, so a square
        # canvas keeps proportions intact across density buckets.
        side = max(silhouette.size)
        square = Image.new("RGBA", (side, side), (255, 255, 255, 0))
        square.paste(
            silhouette,
            ((side - silhouette.width) // 2, (side - silhouette.height) // 2),
        )
        resized = square.resize((edge, edge), Image.LANCZOS)
        out_path = out_dir / "ic_stat_notification.png"
        resized.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path.relative_to(HERE.parent.parent.parent)} ({edge}x{edge})")


if __name__ == "__main__":
    main()
