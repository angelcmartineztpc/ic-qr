"""Prueba de extremo a extremo con un PDF sintético y un servidor HTTP local."""
import asyncio
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import cv2
import pymupdf as fitz
import numpy as np
import pytest

from qrauditor.models import QRStatus
from qrauditor.pipeline import AuditPipeline


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        if self.path == "/ok":
            self.send_response(200)
        elif self.path == "/redir":
            self.send_response(302); self.send_header("Location", "/ok")
        elif self.path == "/loop":
            self.send_response(302); self.send_header("Location", "/loop2")
        elif self.path == "/loop2":
            self.send_response(302); self.send_header("Location", "/loop")
        else:
            self.send_response(404)
        self.end_headers()

    do_GET = do_HEAD

    def log_message(self, *a):
        pass


def qr_png(text: str) -> bytes:
    enc = cv2.QRCodeEncoder.create()
    img = cv2.resize(enc.encode(text), None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    img = cv2.copyMakeBorder(img, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=255)
    return cv2.imencode(".png", img)[1].tobytes()


@pytest.fixture
def server():
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_audit(tmp_path: Path, server: str):
    doc = fitz.open()
    for text in ["/ok", "/redir", "/missing", "/loop"]:
        page = doc.new_page()
        page.insert_text((72, 60), f"Pieza {text}")
        page.insert_image(fitz.Rect(100, 100, 400, 400), stream=qr_png(server + text))
    doc.new_page().insert_text((72, 60), "Sin codigo")
    pdf = tmp_path / "t.pdf"
    doc.save(pdf)

    events = []
    p = AuditPipeline(emit=events.append)
    summary = asyncio.run(p.run(pdf))

    by_page = {r.page: r.qr_status for r in p.rows}
    assert by_page == {1: QRStatus.OK, 2: QRStatus.OK, 3: QRStatus.BROKEN,
                       4: QRStatus.REDIRECT_ERROR, 5: QRStatus.NO_QR}
    assert summary.total_qr == 4 and summary.ok == 2 and summary.broken_links == 2
    assert events[0]["type"] == "start" and events[-1]["type"] == "done"
