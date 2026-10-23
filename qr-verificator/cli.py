"""Auditoría sin interfaz: python cli.py archivo.pdf [salida_sin_extension]"""
import asyncio
import sys
from pathlib import Path

from qrauditor import report
from qrauditor.pipeline import AuditPipeline


async def main(pdf: Path, out: Path) -> None:
    p = AuditPipeline(emit=lambda e: e["type"] == "progress"
                      and print(f"\r{e['done']}/{e['pages']} páginas", end="", flush=True))
    s = await p.run(pdf)
    report.write_csv(p.rows, out.with_suffix(".csv"))
    report.write_xlsx(p.rows, out.with_suffix(".xlsx"))
    print(f"\nQR: {s.total_qr} · OK: {s.ok} · errores: {s.errors} · rotos: {s.broken_links} · {s.elapsed_s}s")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    asyncio.run(main(src, Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name(src.stem + "-auditoria")))
