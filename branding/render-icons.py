#!/usr/bin/env python3
from pathlib import Path
import cairosvg
root=Path(__file__).resolve().parents[1]
src=root/"branding"/"forge-stream-core.svg"
for folder in (root/"StreamForge"/"icons",root/"ForgeCore"/"browser-extension"/"icons"):
    folder.mkdir(parents=True,exist_ok=True)
    for size in (16,32,48,128):
        cairosvg.svg2png(url=str(src),write_to=str(folder/f"icon{size}.png"),output_width=size,output_height=size)
cairosvg.svg2png(url=str(src),write_to=str(root/"ForgeCore"/"server"/"public"/"favicon.png"),output_width=192,output_height=192)
