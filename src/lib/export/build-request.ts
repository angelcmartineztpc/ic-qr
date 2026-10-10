/**
 * Del proyecto al cuerpo de `POST /api/export`: proyección mínima de cada pieza
 * incluida y la lista de las que bloquean la exportación, con su motivo
 * (docs/ARCHITECTURE.md §1.2-22). Código puro y sin red.
 */
import { qrBlocker, type QrBlocker } from "@/lib/records/qr-state";
import { hasBlockingErrors } from "@/lib/validation/validate";
import { defaultFileName, sanitizeFileName } from "@/lib/export/file-name";
import type { ExportRequestInput } from "@/schemas/export";
import type { ProjectState, QRRecord } from "@/types";

export type ExportRecordInput = ExportRequestInput["records"][number];

const QR_REASONS: Record<QrBlocker, string> = {
  error: "El QR tiene un error",
  pending: "Falta generar el QR",
  unverified: "El QR existente aún no se verificó",
  stale: "El Link del menú cambió y el QR quedó desactualizado",
  "existing-undecodable": "No se pudo leer el QR existente (confírmalo para usarlo)",
  "existing-mismatch": "El QR existente apunta a otra URL (confírmalo para usarlo)",
};

export interface ExportBlocker {
  recordId: string;
  reason: string;
}

/** Por qué una pieza no se puede exportar (null = se puede). */
export function blockerOf(record: QRRecord): ExportBlocker | null {
  if (hasBlockingErrors(record.validationErrors)) {
    const first = record.validationErrors.find((issue) => issue.severity === "error");
    return { recordId: record.id, reason: first?.message ?? "La pieza tiene errores" };
  }
  const blocker = qrBlocker(record);
  return blocker ? { recordId: record.id, reason: QR_REASONS[blocker] } : null;
}

/** Proyección que viaja al servidor: sin `extra`, sin metadatos y sin estado de la interfaz. */
export function projectRecord(record: QRRecord): ExportRecordInput {
  return {
    id: record.id,
    area: record.area,
    estacion: record.estacion,
    mesa: record.mesa,
    subgrupo: record.subgrupo,
    concepto: record.concepto,
    menuUrl: record.menuUrl,
    qrUrl: record.qrUrl ?? "",
    qr: record.qr,
    ...(record.qrAck ? { qrAck: record.qrAck } : {}),
  };
}

export interface BuiltExport {
  request: ExportRequestInput;
  /** Piezas que viajan (en su orden). */
  included: QRRecord[];
  /** Piezas incluidas que bloquean: con ellas el servidor responde 400. */
  blocked: ExportBlocker[];
  /** Piezas que la persona dejó fuera de esta exportación. */
  excluded: number;
}

/** El nombre se resuelve al pulsar Descargar: el escrito, o el de fecha y hora locales. */
export function resolveFileName(project: Pick<ProjectState, "exportOptions" | "fileNameTouched">, now: Date): string {
  const typed = project.fileNameTouched ? sanitizeFileName(project.exportOptions.fileName) : "";
  return typed || defaultFileName(now);
}

export function buildExportRequest(project: ProjectState, excludedIds: readonly string[], now: Date): BuiltExport {
  const excluded = new Set(excludedIds);
  const ordered = project.order.flatMap((id) => (project.recordsById[id] ? [project.recordsById[id]] : []));
  const included = ordered.filter((record) => !excluded.has(record.id));
  const blocked = included.flatMap((record) => {
    const blocker = blockerOf(record);
    return blocker ? [blocker] : [];
  });
  const { exportOptions } = project;
  return {
    request: {
      records: included.map(projectRecord),
      templateId: project.templateId,
      templateOverrides: project.templateOverrides,
      layout: project.layout,
      options: { fileName: resolveFileName(project, now), formats: exportOptions.formats, pdf: exportOptions.pdf, svg: exportOptions.svg, zipNaming: exportOptions.zipNaming },
    },
    included,
    blocked,
    excluded: ordered.length - included.length,
  };
}
