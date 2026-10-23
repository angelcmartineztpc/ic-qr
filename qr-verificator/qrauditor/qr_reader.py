"""Decodificación de QR. ZXing-cpp es el lector principal (tolera módulos
redondeados, logos, inversión y poco margen); OpenCV queda como respaldo."""
from __future__ import annotations

import cv2
import numpy as np
import zxingcpp

from .models import PageImage, QRRead

_QR = zxingcpp.BarcodeFormat.QRCode


def _zxing(img: np.ndarray) -> tuple[list[str], int]:
    """(payloads, QR detectados sin decodificar)."""
    good = [b.text for b in zxingcpp.read_barcodes(img, formats=_QR) if b.text]
    bad = [b for b in zxingcpp.read_barcodes(img, formats=_QR, return_errors=True)
           if not b.text and b.format == _QR]
    return good, len(bad)


def _opencv(img: np.ndarray) -> list[str]:
    try:
        ok, decoded, _, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
    except cv2.error:
        return []
    return [d for d in decoded if d] if ok else []


def _variants(img: np.ndarray):
    """Imagen original y versiones que ayudan con QR difíciles."""
    yield img
    pad = cv2.copyMakeBorder(img, 120, 120, 120, 120, cv2.BORDER_CONSTANT, value=int(img.max()))
    yield pad                                         # añade zona silenciosa
    yield cv2.GaussianBlur(pad, (0, 0), 2.0)          # funde módulos redondeados/puntos
    yield cv2.threshold(pad, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    yield cv2.resize(pad, None, fx=0.4, fy=0.4, interpolation=cv2.INTER_AREA)


def read_qr(page: PageImage) -> QRRead:
    img = cv2.imdecode(np.frombuffer(page.png, np.uint8), cv2.IMREAD_GRAYSCALE)
    found: dict[str, None] = {}
    undecoded = 0
    for variant in _variants(img):
        payloads, missing = _zxing(variant)
        found.update(dict.fromkeys(payloads))
        undecoded = max(undecoded, missing)
        if found and not missing:
            break
    if undecoded or not found:                        # respaldo con OpenCV
        for variant in _variants(img):
            found.update(dict.fromkeys(_opencv(variant)))
    undecoded = max(0, undecoded - len(found)) if found else undecoded
    return QRRead(page.page, page.piece, tuple(found), undecoded)
