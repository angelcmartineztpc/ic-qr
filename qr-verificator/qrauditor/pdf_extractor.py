"""Renderiza cada página del PDF a PNG. Cada página abre su propio documento
porque PyMuPDF no es seguro entre hilos con un mismo objeto Document."""
from __future__ import annotations

from pathlib import Path

import pymupdf as fitz

from .models import PageImage


MAX_SIDE_PX = 7000


def count_pages(pdf: Path) -> int:
    with fitz.open(pdf) as doc:
        return doc.page_count


def render_page(pdf: Path, index: int, zoom: float) -> PageImage:
    """Renderiza la página `index` (0-based) con el zoom indicado."""
    with fitz.open(pdf) as doc:
        page = doc[index]
        zoom = min(zoom, MAX_SIDE_PX / max(page.rect.width, page.rect.height))  # piezas de gran formato
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY)
        return PageImage(index + 1, _piece_name(page, index), pix.tobytes("png"))


def _piece_name(page: fitz.Page, index: int) -> str:
    """Etiqueta de página, o primera línea de texto, o 'Página N'."""
    if page.get_label():
        return page.get_label()
    for line in page.get_text().splitlines():
        line = line.strip()
        if len(line) >= 3:
            return line[:60]
    return f"Página {index + 1}"


def thumbnail(pdf: Path, index: int, width_px: int = 360) -> bytes:
    """PNG ligero de una página para mostrar en el dashboard."""
    with fitz.open(pdf) as doc:
        page = doc[index]
        zoom = width_px / page.rect.width
        return page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB).tobytes("png")
