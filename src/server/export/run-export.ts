import "server-only";

import type { FontRegistry } from "@/lib/document/fonts";
import { outlineScene } from "@/lib/document/outline";
import { buildScene } from "@/lib/document/scene";
import { pageCount } from "@/lib/document/sheet";
import { describeLayoutWarning } from "@/lib/errors/messages.es";
import { zipEntryName } from "@/lib/export/file-name";
import { CHUNK_BYTES, encodeFrame, type FileName } from "@/lib/export/frames";
import { resolveLayout } from "@/lib/layout/resolve-layout";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { resolveTemplate } from "@/lib/template/resolve";
import type { ExportRequest } from "@/schemas/export";
import { getTemplate } from "@/templates";
import type { ExportRecord, StorageProvider, Template } from "@/types";

import { PdfSheetWriter } from "../pdf/writer";
import { verifyQrIdentity, QrIdentityError } from "../qr/identity";
import { materializeQrGeometry, MaterializeError } from "../qr/materialize";
import { buildZip } from "./zip";

/** Cede el turno al bucle de eventos. `setTimeout` existe en Node y en Workers; el `setImmediate` de `node:timers/promises` no funciona en Workers. */
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Error de exportación con el código HTTP/`AppErrorPayload` que le corresponde. */
export class ExportError extends Error {
  constructor(
    readonly status: number,
    readonly code: "VALIDATION_FAILED" | "QR_IDENTITY_MISMATCH" | "QR_UNRESOLVED" | "FONTS_MISSING" | "EXPORT_TIMEOUT" | "EXPORT_CANCELLED" | "INTERNAL",
    message: string,
    readonly recordId?: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportDeps {
  fonts: FontRegistry;
  /** Solo lectura: la exportación nunca sube nada (el tipo no deja llamar a `upload`). */
  storage: Pick<StorageProvider, "get" | "keyFromPublicUrl">;
  keyPrefix: string;
  /** Fecha de creación del PDF (fija en los tests para reproducibilidad). */
  now?: () => Date;
  compress?: boolean;
  warn?: (message: string, fields: Record<string, string>) => void;
}

export interface ExportSummary {
  pages: number;
  pieces: number;
  warnings: number;
}

export interface PreparedExport {
  template: Template;
  fonts: ReturnType<FontRegistry["forTemplate"]>;
}

/**
 * Comprobaciones previas, SIN dibujar nada: plantilla y ajustes válidos, fuentes
 * en disco e identidad del QR de cada registro (§S2.5). Si algo falla se
 * responde con un JSON de error y un estado HTTP real, antes de abrir el stream.
 */
export function prepareExport(request: ExportRequest, deps: Pick<ExportDeps, "fonts" | "storage" | "keyPrefix">): PreparedExport {
  const base = getTemplate(request.templateId);
  if (!base) throw new ExportError(400, "VALIDATION_FAILED", `Plantilla desconocida: ${request.templateId}`);
  const resolved = resolveTemplate(base, request.templateOverrides);
  if (!resolved.success) throw new ExportError(400, "VALIDATION_FAILED", `Los ajustes de la plantilla no son válidos: ${resolved.error.issues[0]?.message ?? ""}`);
  const template = resolved.data;

  const fonts = deps.fonts.forTemplate(template);
  try {
    for (const font of template.fonts) fonts(font);
  } catch (error) {
    if (error instanceof Error && /Falta el archivo de fuente/.test(error.message)) throw new ExportError(503, "FONTS_MISSING", "Faltan las fuentes de las piezas en el servidor (ejecuta `bun run fonts:setup`)");
    throw error;
  }

  for (const record of request.records) {
    try {
      verifyQrIdentity(record, { storage: deps.storage, keyPrefix: deps.keyPrefix });
    } catch (error) {
      if (error instanceof QrIdentityError) throw new ExportError(400, "QR_IDENTITY_MISMATCH", error.message, error.recordId);
      throw error;
    }
  }
  return { template, fonts };
}

const label = (record: ExportRecord) => [record.area, record.mesa].filter(Boolean).join(" ");

/**
 * Genera el PDF (y, si se pide, el ZIP de SVG) y lo emite como frames. El PDF se
 * acumula en memoria para conocer su tamaño exacto antes de enviarlo (§S5).
 * Cancelar (`signal`) detiene el bucle entre piezas; no hay archivos temporales.
 * Si es el servidor quien aborta (tiempo máximo), `signal.reason` lo dice.
 */
export async function runExport(request: ExportRequest, prepared: PreparedExport, deps: ExportDeps, signal: AbortSignal, emit: (frame: Uint8Array) => void): Promise<ExportSummary> {
  const { template, fonts } = prepared;
  const { options } = request;
  const total = request.records.length;
  const wantsZip = options.formats.includes("svgZip");
  const wantsPdf = options.formats.includes("pdf");
  const outlinedPdf = options.pdf.textMode === "outlined";
  const outlinedSvg = options.svg.textMode === "outlined";

  const writer = wantsPdf ? new PdfSheetWriter({ tile: template.tile, pdf: options.pdf, fonts, title: options.fileName, ...(deps.now ? { creationDate: deps.now() } : {}), ...(deps.compress === undefined ? {} : { compress: deps.compress }) }) : null;
  const pdfChunks: Buffer[] = [];
  const pdfDone = writer
    ? new Promise<Buffer>((resolve, reject) => {
        writer.doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
        writer.doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
        writer.doc.on("error", reject);
      })
    : null;

  const svgEntries: Array<{ name: string; data: Uint8Array }> = [];
  const encoder = new TextEncoder();
  let warnings = 0;
  let lastProgress = 0;
  const progress = (done: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgress < 100) return; // ≤ 10 por segundo
    lastProgress = now;
    emit(encodeFrame.progress({ phase: "generating", done, total }));
  };
  const throwIfAborted = () => {
    if (!signal.aborted) return;
    const reason = signal.reason as { name?: string } | undefined;
    throw reason?.name === "TimeoutError" ? new ExportError(408, "EXPORT_TIMEOUT", "La exportación tardó demasiado y se canceló") : new ExportError(499, "EXPORT_CANCELLED", "Exportación cancelada");
  };

  progress(0, true);
  for (let index = 0; index < total; index++) {
    throwIfAborted();
    const record = request.records[index] as ExportRecord;
    let geometry;
    try {
      geometry = await materializeQrGeometry(record, { storage: deps.storage, ...(deps.warn ? { warn: deps.warn } : {}) });
    } catch (error) {
      if (error instanceof MaterializeError) throw new ExportError(400, "QR_UNRESOLVED", error.message, error.recordId);
      throw error;
    }
    const sceneRecord = { id: record.id, area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl };
    const layout = resolveLayout(request.layout, record.id);

    if (writer) {
      const scene = buildScene({ template, layout, record: sceneRecord, qr: geometry, fonts, qrStyle: request.templateOverrides.qrStyle, options: { bleedMm: options.pdf.bleedMm, cutLine: options.pdf.cutLine, includeQrBackground: options.pdf.includeQrBackground } });
      for (const warning of scene.warnings) {
        warnings++;
        emit(encodeFrame.warning({ recordId: record.id, code: warning.code, message: describeLayoutWarning(warning) }));
      }
      writer.add(outlinedPdf ? outlineScene(scene, fonts) : scene);
    }
    if (wantsZip) {
      const scene = buildScene({ template, layout, record: sceneRecord, qr: geometry, fonts, qrStyle: request.templateOverrides.qrStyle, options: { cutLine: options.svg.cutLine ? "rgb" : "none", includeQrBackground: options.pdf.includeQrBackground } });
      if (!writer) {
        for (const warning of scene.warnings) {
          warnings++;
          emit(encodeFrame.warning({ recordId: record.id, code: warning.code, message: describeLayoutWarning(warning) }));
        }
      }
      const svg = renderSceneSvg(outlinedSvg ? outlineScene(scene, fonts) : scene);
      svgEntries.push({ name: zipEntryName(index, total, options.zipNaming === "index-area-mesa" ? label(record) : undefined), data: encoder.encode(svg) });
    }
    progress(index + 1, index + 1 === total);
    if ((index + 1) % 25 === 0) await nextTick(); // deja respirar al servidor (y a la cancelación)
  }
  throwIfAborted();

  emit(encodeFrame.progress({ phase: "preparing", done: total, total }));
  const send = (fileId: FileName, name: string, mime: string, bytes: Uint8Array) => {
    emit(encodeFrame.fileMeta({ fileId, name, size: bytes.length, mime }));
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) emit(encodeFrame.fileChunk(fileId, bytes.subarray(offset, offset + CHUNK_BYTES)));
  };

  let pages = 0;
  if (writer && pdfDone) {
    writer.end();
    const pdf = await pdfDone;
    throwIfAborted();
    pages = pageCount(total, writer.grid);
    send("pdf", `${options.fileName}.pdf`, "application/pdf", pdf);
  }
  if (wantsZip) {
    const zip = await buildZip(svgEntries, async () => {
      throwIfAborted();
      await nextTick();
    });
    throwIfAborted();
    send("zip", `${options.fileName}.zip`, "application/zip", zip);
  }
  const summary = { pages, pieces: total, warnings };
  emit(encodeFrame.done(summary));
  return summary;
}
