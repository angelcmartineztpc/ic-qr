"""Parámetros ajustables de la auditoría."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    render_zoom: float = 3.0          # 216 dpi: suficiente para QR impresos
    retry_zoom: float = 5.0           # segundo intento para QR difíciles
    decode_workers: int = 8
    http_concurrency: int = 32
    http_timeout_s: float = 10.0
    max_redirects: int = 8
    user_agent: str = "Mozilla/5.0 (compatible; QRAuditor/1.0)"
    max_upload_mb: int = 200
