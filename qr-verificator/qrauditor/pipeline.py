"""Orquesta extracción, lectura de QR y validación HTTP de forma concurrente.
Emite eventos (dict) mediante un callback para el dashboard en tiempo real."""
from __future__ import annotations

import asyncio
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from . import pdf_extractor
from .config import Settings
from .models import AuditRow, HttpResult, QRRead, QRStatus, Summary
from .qr_reader import read_qr
from .url_validator import UrlValidator

Emit = Callable[[dict], None]


class AuditPipeline:
    def __init__(self, settings: Settings | None = None, emit: Emit = lambda e: None):
        self._s = settings or Settings()
        self._emit = emit
        self.rows: list[AuditRow] = []
        self.summary = Summary()

    async def run(self, pdf: Path) -> Summary:
        started = time.perf_counter()
        total = pdf_extractor.count_pages(pdf)
        self.summary.total_pages = total
        self._emit({"type": "start", "pages": total})

        validator = UrlValidator(self._s)
        http_gate = asyncio.Semaphore(self._s.http_concurrency)
        url_cache: dict[str, asyncio.Task[HttpResult]] = {}
        pool = ThreadPoolExecutor(self._s.decode_workers)
        loop = asyncio.get_running_loop()
        done_pages = 0

        async def check(url: str) -> HttpResult:
            if url not in url_cache:  # URLs repetidas se validan una sola vez
                async def guarded() -> HttpResult:
                    async with http_gate:
                        return await validator.check(url)
                url_cache[url] = asyncio.create_task(guarded())
            return await url_cache[url]

        def scan(index: int) -> QRRead:
            page = pdf_extractor.render_page(pdf, index, self._s.render_zoom)
            result = read_qr(page)
            if not result.payloads:  # reintento a mayor resolución
                page = pdf_extractor.render_page(pdf, index, self._s.retry_zoom)
                result = read_qr(page)
            return result

        async def handle(index: int) -> None:
            nonlocal done_pages
            qr = await loop.run_in_executor(pool, scan, index)
            rows = await self._rows_for(qr, check)
            done_pages += 1
            for row in rows:
                self._record(row)
            self._emit({"type": "progress", "done": done_pages, "pages": total,
                        "rows": [r.to_dict() for r in rows], "summary": _summary_dict(self._snapshot(started))})

        try:
            await asyncio.gather(*(handle(i) for i in range(total)))
        finally:
            await validator.aclose()
            pool.shutdown(wait=False)

        self.rows.sort(key=lambda r: r.page)
        self.summary = self._snapshot(started)
        self._emit({"type": "done", "summary": _summary_dict(self.summary)})
        return self.summary

    async def _rows_for(self, qr: QRRead, check) -> list[AuditRow]:
        rows: list[AuditRow] = []
        for url in qr.payloads:
            res = await check(url)
            rows.append(AuditRow(qr.piece, qr.page, url, res.status, res.http_status,
                                 res.response_ms, res.final_url, res.redirects, res.detail))
        for _ in range(qr.undecoded):
            rows.append(AuditRow(qr.piece, qr.page, "", QRStatus.ILLEGIBLE,
                                 detail="QR detectado pero no se pudo decodificar"))
        if not rows:
            rows.append(AuditRow(qr.piece, qr.page, "", QRStatus.NO_QR,
                                 detail="No se detectó ningún QR en la página"))
        return rows

    def _record(self, row: AuditRow) -> None:
        self.rows.append(row)

    def _snapshot(self, started: float) -> Summary:
        qr_rows = [r for r in self.rows if r.qr_status is not QRStatus.NO_QR]
        counts = Counter(r.qr_status.value for r in self.rows)
        return Summary(
            total_pages=self.summary.total_pages,
            total_qr=len(qr_rows),
            ok=sum(r.qr_status.is_success for r in qr_rows),
            errors=sum(not r.qr_status.is_success for r in qr_rows),
            broken_links=sum(r.qr_status.is_broken_link for r in qr_rows),
            elapsed_s=round(time.perf_counter() - started, 2),
            by_status=dict(counts),
        )


def _summary_dict(s: Summary) -> dict:
    return s.__dict__.copy()
