"""Dessine un repère GPS sur une copie de l'image satellite."""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw

MARKER_RADIUS = 10
MARKER_COLOR = (255, 0, 0)
MARKER_WIDTH = 3
CROSS_HALF_LENGTH = 18


def draw_marker(image_bytes: bytes, x: int, y: int) -> bytes:
    """Retourne une copie PNG de `image_bytes` avec une croix + cercle rouges centrés sur (x, y)."""
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(image)

    draw.line((x - CROSS_HALF_LENGTH, y, x + CROSS_HALF_LENGTH, y), fill=MARKER_COLOR, width=MARKER_WIDTH)
    draw.line((x, y - CROSS_HALF_LENGTH, x, y + CROSS_HALF_LENGTH), fill=MARKER_COLOR, width=MARKER_WIDTH)
    draw.ellipse(
        (x - MARKER_RADIUS, y - MARKER_RADIUS, x + MARKER_RADIUS, y + MARKER_RADIUS),
        outline=MARKER_COLOR,
        width=MARKER_WIDTH,
    )
    draw.text((x + CROSS_HALF_LENGTH + 4, y - 8), "GPS", fill=MARKER_COLOR)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
