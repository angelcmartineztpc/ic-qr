"""API FastAPI: subida de PDF, progreso por SSE y descarga de informes."""
from __future__ import annotations

import asyncio
import json
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import pdf_extractor, report
from .config import Settings
from .pipeline import AuditPipeline

STATIC = Path(__file__).parent / "static"
settings = Settings()
app = FastAPI(title="QR Auditor")


@dataclass
class Job:
    workdir: Path
    name: str
    pdf: Path
    events: list[dict] = field(default_factory=list)
    finished: bool = False
    pipeline: AuditPipeline | None = None


jobs: dict[str, Job] = {}


async def _run(job: Job, pdf: Path) -> None:
    job.pipeline = AuditPipeline(settings, emit=job.events.append)
    try:
        await job.pipeline.run(pdf)
    except Exception as exc:  # PDF corrupto, etc.
        job.events.append({"type": "error", "message": f"No se pudo procesar el PDF: {exc}"})
    finally:
        job.finished = True


@app.post("/api/audit")
async def start_audit(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"El archivo supera {settings.max_upload_mb} MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "El archivo no es un PDF válido")
    workdir = Path(tempfile.mkdtemp(prefix="qrauditor-"))
    pdf = workdir / "input.pdf"
    pdf.write_bytes(data)
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = Job(workdir, Path(file.filename or "auditoria").stem, pdf)
    asyncio.create_task(_run(jobs[job_id], pdf))
    return {"job_id": job_id}


@app.get("/api/audit/{job_id}/events")
async def stream(job_id: str):
    job = _job(job_id)

    async def gen():
        sent = 0
        while True:
            while sent < len(job.events):
                yield f"data: {json.dumps(job.events[sent])}\n\n"
                sent += 1
            if job.finished and sent >= len(job.events):
                return
            await asyncio.sleep(0.15)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})


@app.get("/api/audit/{job_id}/report.{fmt}")
async def download(job_id: str, fmt: str):
    job = _job(job_id)
    if fmt not in ("csv", "xlsx") or not job.finished or not job.pipeline:
        raise HTTPException(404, "Informe no disponible")
    path = job.workdir / f"report.{fmt}"
    (report.write_csv if fmt == "csv" else report.write_xlsx)(job.pipeline.rows, path)
    return FileResponse(path, filename=f"{job.name}-auditoria-qr.{fmt}")


@app.get("/api/audit/{job_id}/page/{page}.png")
async def page_thumbnail(job_id: str, page: int):
    job = _job(job_id)
    if not 1 <= page <= pdf_extractor.count_pages(job.pdf):
        raise HTTPException(404, "Página fuera de rango")
    png = await asyncio.to_thread(pdf_extractor.thumbnail, job.pdf, page - 1)
    return Response(png, media_type="image/png", headers={"Cache-Control": "max-age=3600"})


def _job(job_id: str) -> Job:
    if job_id not in jobs:
        raise HTTPException(404, "Auditoría no encontrada")
    return jobs[job_id]


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
