#!/usr/bin/env python3
"""Render embedded-raster SVG branding without CairoSVG mask/filter loss.

The exported artwork embeds a white mask PNG and a colored PNG; CairoSVG does
not correctly preserve the mask for this SVG and produced transparent icons.
"""
from pathlib import Path
from io import BytesIO
from base64 import b64decode
from re import findall
from PIL import Image, ImageChops, ImageOps

root = Path(__file__).resolve().parents[1]
source = (root / "branding" / "forge-stream-core.svg").read_text(encoding="utf-8")
images = findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)', source)
if len(images) != 2:
    raise RuntimeError("Brand SVG must contain mask and artwork PNGs (in that order)")
mask = Image.open(BytesIO(b64decode(images[0]))).convert("RGBA")
artwork = Image.open(BytesIO(b64decode(images[1]))).convert("RGBA")
if mask.size != artwork.size:
    raise RuntimeError("Brand mask and artwork have different dimensions")
# SVG masking uses luminance and opacity. Retain artwork's own alpha.
mask_luminance = ImageOps.grayscale(mask)
mask_opacity = ImageChops.multiply(mask_luminance, mask.getchannel("A"))
artwork.putalpha(ImageChops.multiply(artwork.getchannel("A"), mask_opacity))
if artwork.getchannel("A").getbbox() is None:
    raise RuntimeError("Rendered icon has no visible pixels")
for directory in (root / "StreamForge" / "icons", root / "ForgeCore" / "browser-extension" / "icons"):
    directory.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        result = artwork.resize((size, size), Image.Resampling.LANCZOS)
        if not result.getchannel("A").getbbox():
            raise RuntimeError(f"Icon {size}px is fully transparent")
        result.save(directory / f"icon{size}.png", optimize=True)
favicon = root / "ForgeCore" / "server" / "public" / "favicon.png"
favicon.parent.mkdir(parents=True, exist_ok=True)
artwork.resize((192, 192), Image.Resampling.LANCZOS).save(favicon, optimize=True)
