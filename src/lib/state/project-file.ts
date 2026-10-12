/**
 * Archivo de proyecto `.qrproj.json` (§S6). Como incluye storageKey, qrUrl y qr,
 * abrirlo NUNCA regenera un QR. Al abrirlo se borran todos los acks (hay que
 * volver a confirmar) y los registros ilegibles van a cuarentena, no se pierden.
 */
import { sanitizeFileName } from "@/lib/export/file-name";
import { hydrateRecords, stripAcks } from "@/lib/records/hydrate";
import { materializeOrder } from "@/lib/records/order";
import { PROJECT_FILE_FORMAT, PROJECT_FILE_MAX_BYTES, PROJECT_SCHEMA_VERSION, ProjectFileSchema } from "@/schemas/project";
import { getTemplate } from "@/templates";
import type { ProjectFile, ProjectState } from "@/types";

import { orderedRecords } from "./project";

export function buildProjectFile(state: ProjectState, now: string): ProjectFile {
  const records = materializeOrder(state.order, state.recordsById);
  return {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: now,
    project: { ...state, recordsById: Object.fromEntries(records.map((r) => [r.id, r])) },
  };
}

export const serializeProjectFile = (state: ProjectState, now: string): string => JSON.stringify(buildProjectFile(state, now));

export function projectFileName(state: Pick<ProjectState, "name">, fallback = "proyecto"): string {
  return `${sanitizeFileName(state.name) || fallback}.qrproj.json`;
}

export interface OpenSummary {
  records: number;
  quarantined: number;
  /** Piezas cuya confirmación (ack) se borró: deben volver a confirmarse. */
  acksCleared: number;
}

export type OpenResult = { ok: true; project: ProjectState; summary: OpenSummary } | { ok: false; message: string };

export function parseProjectFile(text: string, now: string): OpenResult {
  if (new TextEncoder().encode(text).length > PROJECT_FILE_MAX_BYTES) return { ok: false, message: "El archivo es demasiado grande (máximo 20 MB)" };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: "El archivo no es un proyecto válido (no es JSON)" };
  }
  const declared = (json as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof declared === "number" && declared > PROJECT_SCHEMA_VERSION) return { ok: false, message: "Archivo creado con una versión más reciente de la aplicación" };

  const parsed = ProjectFileSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: "El archivo no es un proyecto de QR Production Generator" };
  const { project } = parsed.data;
  if (!getTemplate(project.templateId) || project.layout.templateId !== project.templateId) return { ok: false, message: `El proyecto usa una plantilla desconocida (${project.templateId})` };

  const hydrated = hydrateRecords(project.recordsById, project.order, now);
  const stripped = stripAcks(hydrated.recordsById);
  const state: ProjectState = {
    ...project,
    recordsById: stripped.recordsById,
    order: hydrated.order,
    quarantine: [...project.quarantine, ...hydrated.quarantine],
    // Abrir un archivo deja el proyecto «sin cambios»; si hubo que borrar acks, sí hay algo que guardar.
    revision: stripped.affected.length > 0 ? 1 : 0,
    savedRevision: 0,
    lastLocalSaveAt: now,
  };
  return { ok: true, project: state, summary: { records: orderedRecords(state).length, quarantined: state.quarantine.length, acksCleared: stripped.affected.length } };
}
