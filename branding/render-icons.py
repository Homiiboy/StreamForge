#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
with Image.open(root/"branding"/"forge-stream-core.png") as im:
  im=im.convert("RGBA")
  for folder in (root/"StreamForge"/"icons",root/"ForgeCore"/"browser-extension"/"icons"):
    for size in (16,32,48,128):
      im.resize((size,size),Image.Resampling.LANCZOS).save(folder/f"icon{size}.png",optimize=True)
  im.save(root/"ForgeCore"/"server"/"public"/"favicon.png",optimize=True)
