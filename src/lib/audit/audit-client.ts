import { z } from "zod";

import { postJson } from "@/lib/app/api-client";
import { AUDIT_MAX_BATCH } from "@/schemas/audit";

import { openPdf } from "./load-pdf";
import { AUDIT_STATUSES, rowsForPage, summarize, type AuditRow, type AuditSummary, type PageRead, type UrlCheck } from "./models";
import { readPage, type Raster } from "./read-pdf-qr";

const ChecksSchema = z.object({
  results: z.record(
    z.string(),
    z.object({
      status: z.enum(AUDIT_STATUSES as [string, ...string[]]),
      httpStatus: z.number().optional(),
      responseMs: z.number().optional(),
      finalUrl: z.string().optional(),
      redirects: z.number().optional(),
      detail: z.string().optional(),
    }),
  ),
});

/** Páginas que se leen antes de comprobar sus URL: da avance continuo sin una petición por página. */
const PAGES_PER_CHUNK = 10;
const THUMB_WIDTH = 420;

/** Miniatura JPEG de la pieza tal como se leyó. */
function makeThumb(raster: Raster): string {
  const full = Object.assign(document.createElement("canvas"), { width: raster.width, height: raster.height });
  full.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  const scale = Math.min(1, THUMB_WIDTH / raster.width);
  const small = Object.assign(document.createElement("canvas"), { width: Math.round(raster.width * scale), height: Math.round(raster.height * scale) });
  small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.72);
}

export interface AuditProgress {
  done: number;
  total: number;
  rows: AuditRow[];
  summary: AuditSummary;
}

async function validate(urls: string[], signal: AbortSignal): Promise<Map<string, UrlCheck>> {
  const checks = new Map<string, UrlCheck>();
  for (let i = 0; i < urls.length; i += AUDIT_MAX_BATCH) {
    const parsed = ChecksSchema.parse(await postJson<unknown>("/api/audit/validate", { urls: urls.slice(i, i + AUDIT_MAX_BATCH) }, signal));
    for (const [url, check] of Object.entries(parsed.results)) checks.set(url, check as UrlCheck);
  }
  return checks;
}

/** Lee el PDF aquí (nunca se sube) y comprueba en el servidor solo las direcciones, una vez por URL distinta. */
export async function auditPdf(file: File, signal: AbortSignal, onProgress: (p: AuditProgress) => void): Promise<AuditProgress> {
  const pdf = await openPdf(file);
  try {
    const labels = await pdf.getPageLabels();
    const total = pdf.numPages;
    const known = new Map<string, UrlCheck>();
    const rows: AuditRow[] = [];
    let progress: AuditProgress = { done: 0, total, rows, summary: summarize(rows, total) };
    for (let start = 0; start < total; start += PAGES_PER_CHUNK) {
      const reads: PageRead[] = [];
      for (let i = start; i < Math.min(start + PAGES_PER_CHUNK, total); i++) {
        signal.throwIfAborted();
        reads.push(await readPage(pdf, i, labels, makeThumb));
      }
      const fresh = [...new Set(reads.flatMap((r) => r.payloads))].filter((u) => !known.has(u));
      if (fresh.length > 0) for (const [url, check] of await validate(fresh, signal)) known.set(url, check);
      for (const read of reads) rows.push(...rowsForPage(read, known));
      progress = { done: start + reads.length, total, rows: [...rows], summary: summarize(rows, total) };
      onProgress(progress);
    }
    return progress;
  } finally {
    void pdf.loadingTask.destroy();
  }
}
