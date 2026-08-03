#!/usr/bin/env python3
"""Generate placeholder PWA icons for the Milani Sangha Club platform.

Writes PNGs into frontend/public/icons/ with no third-party dependencies
(pure zlib + struct PNG encoding), so it runs on a stock macOS Python 3.

Replace the generated files with the club's real logo before launch; keep the
same filenames and sizes so the web app manifest needs no changes.

Usage:  python3 scripts/generate_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

BRAND = (15, 61, 46)  # #0F3D2E — deep club green
INK = (255, 255, 255)
OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"

# (filename, size, padding fraction) — maskable icons need a safe zone.
TARGETS = [
    ("icon-192.png", 192, 0.14),
    ("icon-512.png", 512, 0.14),
    ("icon-maskable-512.png", 512, 0.26),
    ("apple-touch-icon-180.png", 180, 0.14),
    ("favicon-32.png", 32, 0.10),
]


def rounded_square_alpha(size: int, radius: float, transparent_corners: bool) -> list[list[float]]:
    """Coverage mask (0..1) for a rounded square filling the canvas."""
    mask = [[1.0] * size for _ in range(size)]
    if not transparent_corners:
        return mask
    for y in range(size):
        for x in range(size):
            # Distance from the nearest rounded corner centre.
            cx = min(max(x + 0.5, radius), size - radius)
            cy = min(max(y + 0.5, radius), size - radius)
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dist = (dx * dx + dy * dy) ** 0.5
            mask[y][x] = min(max(radius - dist + 0.5, 0.0), 1.0)
    return mask


def draw_monogram(size: int, pad: float) -> list[list[float]]:
    """Coverage mask (0..1) for a blocky letter 'M'."""
    mask = [[0.0] * size for _ in range(size)]
    left = size * pad
    right = size * (1.0 - pad)
    top = size * (pad + 0.06)
    bottom = size * (1.0 - pad - 0.06)
    stroke = (right - left) * 0.19
    half = stroke / 2.0
    cx = (left + right) / 2.0

    def stamp(px: float, py: float, coverage: float) -> None:
        ix, iy = int(px), int(py)
        if 0 <= ix < size and 0 <= iy < size:
            mask[iy][ix] = max(mask[iy][ix], coverage)

    steps = size * 8
    for i in range(steps + 1):
        t = i / steps
        y = top + (bottom - top) * t
        # Two upright stems.
        for stem_x in (left + half, right - half):
            for dx in range(int(-half) - 1, int(half) + 2):
                px = stem_x + dx
                coverage = 1.0 if abs(dx) <= half - 1 else max(0.0, half - abs(dx))
                stamp(px, y, min(1.0, coverage))
        # Two diagonals meeting at the centre-bottom of the vertex.
        vertex_y = top + (bottom - top) * 0.62
        if y <= vertex_y:
            ratio = (y - top) / (vertex_y - top)
            for diag_x in (left + half + (cx - left - half) * ratio,
                           right - half - (right - half - cx) * ratio):
                for dx in range(int(-half) - 1, int(half) + 2):
                    coverage = 1.0 if abs(dx) <= half - 1 else max(0.0, half - abs(dx))
                    stamp(diag_x + dx, y, min(1.0, coverage))
    return mask


def write_png(path: Path, size: int, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type: none
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def build(name: str, size: int, pad: float) -> None:
    maskable = "maskable" in name
    plate = rounded_square_alpha(size, size * 0.22, transparent_corners=not maskable)
    glyph = draw_monogram(size, pad)

    pixels: list[list[tuple[int, int, int, int]]] = []
    for y in range(size):
        row: list[tuple[int, int, int, int]] = []
        for x in range(size):
            a = plate[y][x]
            g = glyph[y][x] * a
            r = round(BRAND[0] * (1 - g) + INK[0] * g)
            gg = round(BRAND[1] * (1 - g) + INK[1] * g)
            b = round(BRAND[2] * (1 - g) + INK[2] * g)
            row.append((r, gg, b, round(a * 255)))
        pixels.append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_png(OUT_DIR / name, size, pixels)
    print(f"wrote {OUT_DIR / name} ({size}x{size})")


if __name__ == "__main__":
    for filename, dimension, padding in TARGETS:
        build(filename, dimension, padding)
