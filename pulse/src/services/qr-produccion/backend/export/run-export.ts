
import type { FontRegistry } from "@/services/qr-produccion/document/fonts";
import { outlineScene } from "@/services/qr-produccion/document/outline";
import { buildScene } from "@/services/qr-produccion/document/scene";
import { pageCount } from "@/services/qr-produccion/document/sheet";
import { describeLayoutWarning } from "@/services/qr-produccion/errors/messages.es";
import { sanitizeFileName, zipEntryName } from "@/services/qr-produccion/export/file-name";
import { CHUNK_BYTES, encodeFrame, type FileName } from "@/services/qr-produccion/export/frames";
import { resolveLayout } from "@/services/qr-produccion/layout/resolve-layout";
import { blockingQrStyleWarnings } from "@/services/qr-produccion/qr-style";
import { renderSceneSvg } from "@/services/qr-produccion/svg/render-scene";
import { resolveTemplate } from "@/services/qr-produccion/template/resolve";
import type { ExportRequest } from "@/services/qr-produccion/schemas/export";
import { getTemplate } from "@/services/qr-produccion/templates";
import type { ExportRecord, StorageProvider, Template } from "@/types";

import { verifyQrIdentity, QrIdentityError } from "../qr/identity";
import { materializeQrGeometry, MaterializeError } from "../qr/materialize";
import type { PdfSheet, PdfSheetFactory } from "./pdf-port";
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
  /** Escritor de PDF (pdfkit en producción; falso en las pruebas). */
  createPdfSheet: PdfSheetFactory;
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

  // Misma regla que la pantalla Exportar: un estilo que deja el QR ilegible no se fabrica aunque la petición llegue directa.
  const styleBlockers = blockingQrStyleWarnings(request.templateOverrides.qrStyle, template.qr, request.records.flatMap((r) => (r.qr.source === "generated" ? [r.qr.payload] : [])));
  if (styleBlockers.length > 0) throw new ExportError(400, "VALIDATION_FAILED", `El estilo del QR no se puede fabricar: ${styleBlockers.map(describeLayoutWarning).join(" ")}`);

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

/** 0 → A, 25 → Z, 26 → AA… */
const sectionLetter = (n: number): string => (n < 26 ? "" : sectionLetter(Math.floor(n / 26) - 1)) + String.fromCharCode(65 + (n % 26));

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
  // Exportación por lotes: la numeración de los SVG es sobre el total de piezas, no sobre las de esta llamada.
  const nameOffset = options.batch?.offset ?? 0;
  const nameTotal = options.batch?.total ?? total;
  const wantsZip = options.formats.includes("svgZip");
  const wantsPdf = options.formats.includes("pdf");
  const outlinedPdf = options.pdf.textMode === "outlined";
  const outlinedSvg = options.svg.textMode === "outlined";

  // Un PDF por Estación (orden de primera aparición en el Excel) o uno solo, con la clave "".
  const bySection = wantsPdf && options.pdfBySection;
  const sections = new Map<string, { sheet: PdfSheet; count: number }>();
  const sectionFor = (record: ExportRecord) => {
    const key = bySection ? record.estacion.trim() || "Sin estación" : "";
    let section = sections.get(key);
    if (!section) {
      const sheet = deps.createPdfSheet({ tile: template.tile, pdf: options.pdf, fonts, title: options.fileName, ...(deps.now ? { creationDate: deps.now() } : {}), ...(deps.compress === undefined ? {} : { compress: deps.compress }) });
      section = { sheet, count: 0 };
      sections.set(key, section);
    }
    return section;
  };

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

    if (wantsPdf) {
      const section = sectionFor(record);
      section.count++;
      const scene = buildScene({ template, layout, record: sceneRecord, qr: geometry, fonts, qrStyle: request.templateOverrides.qrStyle, options: { bleedMm: options.pdf.bleedMm, cutLine: options.pdf.cutLine, includeQrBackground: options.pdf.includeQrBackground } });
      for (const warning of scene.warnings) {
        warnings++;
        emit(encodeFrame.warning({ recordId: record.id, code: warning.code, message: describeLayoutWarning(warning) }));
      }
      section.sheet.add(outlinedPdf ? outlineScene(scene, fonts) : scene);
    }
    if (wantsZip) {
      const scene = buildScene({ template, layout, record: sceneRecord, qr: geometry, fonts, qrStyle: request.templateOverrides.qrStyle, options: { cutLine: options.svg.cutLine ? "rgb" : "none", includeQrBackground: options.pdf.includeQrBackground } });
      if (!wantsPdf) {
        for (const warning of scene.warnings) {
          warnings++;
          emit(encodeFrame.warning({ recordId: record.id, code: warning.code, message: describeLayoutWarning(warning) }));
        }
      }
      const svg = renderSceneSvg(outlinedSvg ? outlineScene(scene, fonts) : scene);
      svgEntries.push({ name: zipEntryName(nameOffset + index, nameTotal, options.zipNaming === "index-area-mesa" ? label(record) : undefined), data: encoder.encode(svg) });
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
  let sectionIndex = 0;
  for (const [key, section] of sections) {
    const pdf = await section.sheet.finish();
    throwIfAborted();
    pages += pageCount(section.count, section.sheet.grid);
    if (bySection) svgEntries.push({ name: `QR_SECCION ${sectionLetter(sectionIndex++)}_${sanitizeFileName(key)}.pdf`, data: pdf });
    else send("pdf", `${options.fileName}.pdf`, "application/pdf", pdf);
  }
  if (wantsZip || bySection) {
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
