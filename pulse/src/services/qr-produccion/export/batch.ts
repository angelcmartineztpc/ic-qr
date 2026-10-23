/**
 * Exportación por lotes. Una Edge Function tiene un techo de CPU por llamada (≈ 2 s), así que una exportación
 * grande se parte en lotes de `EXPORT_BATCH_RECORDS` piezas que se piden de una en una y se juntan en el navegador
 * y se unen en el navegador: los PDF de los lotes en UN PDF (pdf-lib, ver `merge-pdf.ts`) y los SVG, con su numeración
 * global, en un ZIP. Con «un PDF por Estación» siguen siendo varios PDF (cada uno en la carpeta de su lote dentro del ZIP).
 * Si la unión falla, no se pierde nada: se entregan los PDF por lote en el ZIP y un aviso lo explica.
 */
import { unzipSync, zipSync, type Zippable } from "fflate";

import { packGrid } from "@/services/qr-produccion/document/sheet";
import type { ExportRequestInput } from "@/services/qr-produccion/schemas/export";
import { getTemplate } from "@/services/qr-produccion/templates";
import type { PDFOptions } from "@/types";

import type { ExportCallbacks, ExportFile, ExportResult } from "./client";
import { ExportCancelledError } from "./client";
import type { DonePayload, WarningPayload } from "./frames";
import { mergePdfs } from "./merge-pdf";

/** Piezas por llamada. Debe ser ≤ `EXPORT_MAX_RECORDS` del servidor (200 por defecto; 100 deja margen de CPU). */
export const EXPORT_BATCH_RECORDS = 100;

export interface BatchPlan {
  offset: number;
  length: number;
}

/**
 * Lotes consecutivos y equilibrados (nunca uno de 1 pieza sobrando): 250 con tope 100 → 84 + 83 + 83.
 * Con `sheetSize` > 1 (varias piezas por hoja) cada lote es un múltiplo de la hoja, menos el último: al unir los PDF no queda
 * una hoja a medias en mitad del documento (la hoja de un lote no se completa con piezas del siguiente).
 */
export function planBatches(count: number, maxPerBatch: number, sheetSize = 1): BatchPlan[] {
  if (count <= 0) return [];
  if (sheetSize > 1) {
    const step = Math.max(sheetSize, Math.floor(maxPerBatch / sheetSize) * sheetSize);
    return Array.from({ length: Math.ceil(count / step) }, (_, i) => ({ offset: i * step, length: Math.min(step, count - i * step) }));
  }
  const parts = Math.ceil(count / maxPerBatch);
  const base = Math.floor(count / parts);
  const extra = count % parts;
  const plan: BatchPlan[] = [];
  let offset = 0;
  for (let i = 0; i < parts; i++) {
    const length = base + (i < extra ? 1 : 0);
    plan.push({ offset, length });
    offset += length;
  }
  return plan;
}

/** Piezas por hoja del PDF (1 si no se puede calcular o si la hoja es de una pieza). Mismo cálculo que el escritor del PDF. */
export function piecesPerSheet(request: ExportRequestInput): number {
  try {
    const template = getTemplate(request.templateId);
    return template ? packGrid({ tile: template.tile, options: request.options.pdf as PDFOptions }).perPage : 1;
  } catch {
    return 1;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const bytesOf = async (file: ExportFile) => new Uint8Array(await file.blob.arrayBuffer());

export type SingleRunner = (request: ExportRequestInput, callbacks: ExportCallbacks, signal?: AbortSignal) => Promise<ExportResult>;

export async function runBatchedExport(request: ExportRequestInput, callbacks: ExportCallbacks, signal: AbortSignal | undefined, runSingle: SingleRunner, maxPerBatch = EXPORT_BATCH_RECORDS, merge: (parts: readonly Uint8Array[]) => Promise<Uint8Array> = mergePdfs): Promise<ExportResult> {
  const grand = request.records.length;
  const mergesPdf = (request.options.formats ?? ["pdf"]).includes("pdf") && !request.options.pdfBySection;
  const plan = planBatches(grand, maxPerBatch, mergesPdf ? piecesPerSheet(request) : 1);
  const fileName = request.options.fileName;
  const entries: Zippable = {};
  const pdfParts: Array<{ name: string; data: Uint8Array }> = [];
  const warnings: WarningPayload[] = [];
  const done: DonePayload = { pages: 0, pieces: 0, warnings: 0 };

  for (const [index, part] of plan.entries()) {
    if (signal?.aborted) throw new ExportCancelledError();
    const partRequest: ExportRequestInput = { ...request, records: request.records.slice(part.offset, part.offset + part.length), options: { ...request.options, batch: { offset: part.offset, total: grand } } };
    // Solo el avance de generación se suma entre lotes; «preparando» y «descargando» son del archivo final.
    const result = await runSingle(partRequest, { onPhase: (phase) => phase.phase === "generating" && callbacks.onPhase?.({ phase: "generating", done: part.offset + phase.done, total: grand }) }, signal);

    const label = pad(index + 1);
    if (result.files.pdf) pdfParts.push({ name: `${fileName}-parte-${label}.pdf`, data: await bytesOf(result.files.pdf) });
    if (result.files.zip) {
      const inner = unzipSync(await bytesOf(result.files.zip));
      // Con un PDF por Estación los nombres se repiten entre lotes: cada lote va en su carpeta. Los SVG ya llevan numeración global.
      for (const [name, data] of Object.entries(inner)) entries[request.options.pdfBySection ? `parte-${label}/${name}` : name] = [data, { level: name.endsWith(".pdf") ? 0 : 6 }];
    }
    done.pages += result.done.pages;
    done.pieces += result.done.pieces;
    done.warnings += result.done.warnings;
    warnings.push(...result.warnings);
  }

  callbacks.onPhase?.({ phase: "preparing", done: grand, total: grand });
  const files: ExportResult["files"] = {};
  if (pdfParts.length > 0) {
    try {
      const pdf = await merge(pdfParts.map((part) => part.data));
      files.pdf = { name: `${fileName}.pdf`, mime: "application/pdf", blob: new Blob([pdf as BlobPart], { type: "application/pdf" }) };
    } catch (error) {
      // Sin unión no se pierde el trabajo: los PDF por lote van en el ZIP, y la persona lo sabe.
      for (const part of pdfParts) entries[part.name] = [part.data, { level: 0 }];
      warnings.push({ code: "PDF_MERGE_FAILED", message: `No se pudieron unir los PDF en uno solo (${error instanceof Error ? error.message : "error desconocido"}). Se entregan los ${pdfParts.length} PDF por lote dentro del ZIP.` });
      done.warnings += 1;
    }
  }
  if (Object.keys(entries).length > 0) {
    const zip = zipSync(entries);
    files.zip = { name: `${fileName}.zip`, mime: "application/zip", blob: new Blob([zip as BlobPart], { type: "application/zip" }) };
  }
  const last = files.pdf ?? files.zip;
  if (last) callbacks.onPhase?.({ phase: "downloading", bytes: last.blob.size, size: last.blob.size, file: files.pdf ? "pdf" : "zip" });
  return { files, done, warnings };
}
