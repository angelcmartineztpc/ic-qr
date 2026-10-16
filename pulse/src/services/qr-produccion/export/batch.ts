/**
 * Exportación por lotes. Una Edge Function tiene un techo de CPU por llamada (≈ 2 s), así que una exportación
 * grande se parte en lotes de `EXPORT_BATCH_RECORDS` piezas que se piden de una en una y se juntan en el navegador
 * en UN ZIP (un PDF por lote, o los SVG con su numeración global). Un PDF único de miles de piezas no se puede
 * fabricar así: sin una librería para unir PDF (no hay permiso para añadir dependencias) cada lote es su propio PDF.
 */
import { unzipSync, zipSync, type Zippable } from "fflate";

import type { ExportRequestInput } from "@/services/qr-produccion/schemas/export";

import type { ExportCallbacks, ExportFile, ExportResult } from "./client";
import { ExportCancelledError } from "./client";
import type { DonePayload, WarningPayload } from "./frames";

/** Piezas por llamada. Debe ser ≤ `EXPORT_MAX_RECORDS` del servidor (200 por defecto; 100 deja margen de CPU). */
export const EXPORT_BATCH_RECORDS = 100;

export interface BatchPlan {
  offset: number;
  length: number;
}

/** Lotes consecutivos y equilibrados (nunca uno de 1 pieza sobrando): 250 con tope 100 → 84 + 83 + 83. */
export function planBatches(count: number, maxPerBatch: number): BatchPlan[] {
  if (count <= 0) return [];
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

const pad = (n: number) => String(n).padStart(2, "0");
const bytesOf = async (file: ExportFile) => new Uint8Array(await file.blob.arrayBuffer());

export type SingleRunner = (request: ExportRequestInput, callbacks: ExportCallbacks, signal?: AbortSignal) => Promise<ExportResult>;

export async function runBatchedExport(request: ExportRequestInput, callbacks: ExportCallbacks, signal: AbortSignal | undefined, runSingle: SingleRunner, maxPerBatch = EXPORT_BATCH_RECORDS): Promise<ExportResult> {
  const grand = request.records.length;
  const plan = planBatches(grand, maxPerBatch);
  const fileName = request.options.fileName;
  const entries: Zippable = {};
  const warnings: WarningPayload[] = [];
  const done: DonePayload = { pages: 0, pieces: 0, warnings: 0 };

  for (const [index, part] of plan.entries()) {
    if (signal?.aborted) throw new ExportCancelledError();
    const partRequest: ExportRequestInput = { ...request, records: request.records.slice(part.offset, part.offset + part.length), options: { ...request.options, batch: { offset: part.offset, total: grand } } };
    // Solo el avance de generación se suma entre lotes; «preparando» y «descargando» son del archivo final.
    const result = await runSingle(partRequest, { onPhase: (phase) => phase.phase === "generating" && callbacks.onPhase?.({ phase: "generating", done: part.offset + phase.done, total: grand }) }, signal);

    const label = pad(index + 1);
    if (result.files.pdf) entries[`${fileName}-parte-${label}.pdf`] = [await bytesOf(result.files.pdf), { level: 0 }];
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
  const zip = zipSync(entries);
  callbacks.onPhase?.({ phase: "downloading", bytes: zip.length, size: zip.length, file: "zip" });
  return {
    files: { zip: { name: `${fileName}.zip`, mime: "application/zip", blob: new Blob([zip as BlobPart], { type: "application/zip" }) } },
    done,
    warnings,
  };
}
