/**
 * Estado del proyecto y sus transformaciones. TODO son funciones puras
 * (estado → estado): se prueban sin Zustand, sin React y sin navegador, y el
 * store solo las aplica y sube `revision`.
 */
import { applyQrResolution, acknowledgeQr, createRecord, duplicateRecord, regenerateQr, updateRecordData, withDerived } from "@/lib/records/factory";
import { canApplyResolution } from "@/lib/records/qr-state";
import { insertAfter, moveTo, removeIds, sortOrder, type SortKey } from "@/lib/records/order";
import { switchTemplate } from "@/lib/template/resolve";
import { newRecordId } from "@/lib/ids";
import { DEFAULT_DUPLICATE_KEY } from "@/schemas/import";
import { PDF_DEFAULTS } from "@/schemas/pdf";
import { PROJECT_SCHEMA_VERSION } from "@/schemas/project";
import { EMPTY_TEMPLATE_OVERRIDES } from "@/schemas/template";
import { getTemplate, DEFAULT_TEMPLATE_ID } from "@/templates";
import type { PersistedProject, ProjectState, QrAck, QRRecord, QrResolution, RecordDraft, RecordId, Template } from "@/types";

export type { ProjectState };

export function createEmptyProject(now: string, options: { id?: string; name?: string; templateId?: string } = {}): ProjectState {
  const template = getTemplate(options.templateId ?? DEFAULT_TEMPLATE_ID);
  if (!template) throw new Error(`Plantilla desconocida: ${options.templateId}`);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: options.id ?? newRecordId(),
    name: options.name ?? "",
    recordsById: {},
    order: [],
    quarantine: [],
    templateId: template.id,
    templateOverrides: structuredClone(EMPTY_TEMPLATE_OVERRIDES) as ProjectState["templateOverrides"],
    layout: { templateId: template.id, base: template.defaultLayout, overrides: {} },
    exportOptions: { fileName: "", formats: ["pdf"], pdf: { ...PDF_DEFAULTS, pageSize: { ...PDF_DEFAULTS.pageSize }, margins: { ...PDF_DEFAULTS.margins } }, svg: { textMode: "outlined", cutLine: false }, zipNaming: "index" },
    fileNameTouched: false,
    duplicateKey: { ...DEFAULT_DUPLICATE_KEY, fields: [...DEFAULT_DUPLICATE_KEY.fields] },
    revision: 0,
    savedRevision: 0,
    lastLocalSaveAt: now,
  };
}

const touch = (state: ProjectState): ProjectState => ({ ...state, revision: state.revision + 1 });
const withRecord = (state: ProjectState, record: QRRecord): ProjectState => ({ ...state, recordsById: { ...state.recordsById, [record.id]: record } });

export const isDirty = (state: Pick<ProjectState, "revision" | "savedRevision">): boolean => state.revision !== state.savedRevision;
export const markSaved = (state: ProjectState, now: string): ProjectState => ({ ...state, savedRevision: state.revision, lastLocalSaveAt: now });
export const orderedRecords = (state: Pick<ProjectState, "order" | "recordsById">): QRRecord[] => state.order.flatMap((id) => (state.recordsById[id] ? [state.recordsById[id]] : []));

// ---------- alta, edición, borrado ----------

export function addRecord(state: ProjectState, draft: RecordDraft, now: string, options: { afterId?: RecordId; origin?: "manual" | "excel"; id?: string } = {}): { state: ProjectState; record: QRRecord } {
  const record = createRecord(draft, { now, order: state.order.length, origin: options.origin ?? "manual", ...(options.id ? { id: options.id } : {}) });
  const next = touch({ ...withRecord(state, record), order: insertAfter(state.order, [record.id], options.afterId) });
  return { state: next, record };
}

/** Una pieza que entra desde un Excel ya revisado (§S1.10). */
export interface ImportItem {
  draft: RecordDraft;
  /** Fila real de Excel. */
  row: number;
  extra: Record<string, string>;
  /** Es la copia de una fila del archivo o de una pieza que ya existía (modo «Mantener»). */
  duplicateOf?: { kind: "row"; row: number } | { kind: "record"; recordId: RecordId };
  /** El Link del QR no es seguro o su host no está permitido: la pieza se crea ya bloqueada. */
  qrIssue?: "unsafe-url" | "host-not-allowed";
}

export interface ImportOutcome {
  state: ProjectState;
  /** Ids creados, en el orden del archivo. */
  created: RecordId[];
}

const QR_ISSUE_TEXT = {
  "unsafe-url": "El Link del QR no es seguro (puerto, credenciales o dirección no pública); corrígelo para poder usarlo",
  "host-not-allowed": "El host del Link del QR no está permitido para QR existentes; corrígelo para poder usarlo",
} as const;

/**
 * Crea de golpe todas las piezas de una importación: una sola mutación (un solo
 * paso de deshacer y de autoguardado). `replace` descarta antes las piezas actuales.
 * Con Link del QR la pieza nace como QR existente: nunca se generará otro.
 */
export function importRecords(state: ProjectState, items: readonly ImportItem[], options: { now: string; fileName: string; mode: "append" | "replace" }): ImportOutcome {
  const base: ProjectState = options.mode === "replace" ? { ...state, recordsById: {}, order: [] } : state;
  const ids = new Map<number, RecordId>(items.map((item) => [item.row, newRecordId()]));
  const recordsById = { ...base.recordsById };
  const created: RecordId[] = [];
  let index = base.order.length;
  for (const item of items) {
    const id = ids.get(item.row) ?? newRecordId();
    const origin = item.duplicateOf?.kind === "row" ? ids.get(item.duplicateOf.row) : item.duplicateOf?.recordId;
    let record = createRecord(item.draft, { now: options.now, order: index++, origin: "excel", id, sourceFile: options.fileName, sourceRow: item.row, extra: item.extra, ...(origin ? { duplicateOf: origin } : {}) });
    if (item.qrIssue && record.qr.source === "existing") record = withDerived({ ...record, qrError: { code: item.qrIssue, message: QR_ISSUE_TEXT[item.qrIssue] } });
    recordsById[id] = record;
    created.push(id);
  }
  return { state: touch({ ...base, recordsById, order: [...base.order, ...created] }), created };
}

export function updateRecord(state: ProjectState, id: RecordId, draft: RecordDraft, now: string): ProjectState {
  const current = state.recordsById[id];
  return current ? touch(withRecord(state, updateRecordData(current, draft, now))) : state;
}

export interface Removed {
  records: QRRecord[];
  /** Posición original de cada pieza en `order`, para restaurarlas donde estaban. */
  positions: Array<{ id: RecordId; index: number }>;
}

export function deleteRecords(state: ProjectState, ids: readonly RecordId[]): { state: ProjectState; removed: Removed } {
  const present = ids.filter((id) => state.recordsById[id]);
  const positions = present.map((id) => ({ id, index: state.order.indexOf(id) })).sort((a, b) => a.index - b.index);
  const records = positions.map((p) => state.recordsById[p.id] as QRRecord);
  const recordsById = { ...state.recordsById };
  for (const id of present) delete recordsById[id];
  const layoutOverrides = Object.fromEntries(Object.entries(state.layout.overrides).filter(([id]) => !present.includes(id)));
  if (present.length === 0) return { state, removed: { records: [], positions: [] } };
  return { state: touch({ ...state, recordsById, order: removeIds(state.order, present), layout: { ...state.layout, overrides: layoutOverrides } }), removed: { records, positions } };
}

/** Deshacer un borrado: cada pieza vuelve a su posición original. */
export function restoreRecords(state: ProjectState, removed: Removed): ProjectState {
  const recordsById = { ...state.recordsById };
  const order = [...state.order];
  for (const { id, index } of removed.positions) {
    const record = removed.records.find((r) => r.id === id);
    if (!record || recordsById[id]) continue;
    recordsById[id] = record;
    order.splice(Math.min(index, order.length), 0, id);
  }
  return touch({ ...state, recordsById, order });
}

export function duplicateRecordIn(state: ProjectState, id: RecordId, now: string): { state: ProjectState; record: QRRecord } | null {
  const source = state.recordsById[id];
  if (!source) return null;
  const copy = duplicateRecord(source, { now, order: state.order.length });
  return { state: touch({ ...withRecord(state, copy), order: insertAfter(state.order, [copy.id], id) }), record: copy };
}

export const moveRecord = (state: ProjectState, id: RecordId, index: number): ProjectState => touch({ ...state, order: moveTo(state.order, id, index) });
export const sortRecords = (state: ProjectState, key: SortKey): ProjectState => touch({ ...state, order: sortOrder(state.order, state.recordsById, key) });

// ---------- QR ----------

/** Lo que se envió al servidor para un registro (la guarda de aplicación lo compara con el estado actual). */
export interface SentSnapshot {
  menuUrl: string;
  qrUrl?: string | undefined;
}

export interface AppliedResolutions {
  state: ProjectState;
  applied: RecordId[];
  /** Resultados descartados porque el registro cambió mientras se resolvía (o ya no existe). */
  discarded: RecordId[];
}

export function applyResolutions(state: ProjectState, results: readonly QrResolution[], sent: ReadonlyMap<RecordId, SentSnapshot>, now: string): AppliedResolutions {
  let next = state;
  const applied: RecordId[] = [];
  const discarded: RecordId[] = [];
  for (const result of results) {
    const current = next.recordsById[result.recordId];
    const snapshot = sent.get(result.recordId);
    if (!current || !snapshot || !canApplyResolution(current, snapshot, result)) {
      discarded.push(result.recordId);
      continue;
    }
    next = withRecord(next, applyQrResolution(current, result, now));
    applied.push(result.recordId);
  }
  return { state: applied.length > 0 ? touch(next) : state, applied, discarded };
}

/** Un fallo de red al resolver deja el error visible en cada pieza (nunca silencioso). */
export function markQrFailure(state: ProjectState, ids: readonly RecordId[], error: { code: "storage-failed" | "unreachable"; message: string }, now: string): ProjectState {
  let next = state;
  for (const id of ids) {
    const current = next.recordsById[id];
    if (current && current.qr.source !== "generated") next = withRecord(next, applyQrResolution(current, { recordId: id, outcome: "failed", error }, now));
  }
  return next === state ? state : touch(next);
}

export function acknowledge(state: ProjectState, id: RecordId, kind: QrAck["kind"], now: string): ProjectState {
  const current = state.recordsById[id];
  return current ? touch(withRecord(state, acknowledgeQr(current, kind, now))) : state;
}

export function regenerate(state: ProjectState, id: RecordId, now: string): ProjectState {
  const current = state.recordsById[id];
  return current ? touch(withRecord(state, regenerateQr(current, now))) : state;
}

/** Quita el error de un registro para poder reintentar. */
export function clearQrError(state: ProjectState, id: RecordId, now: string): ProjectState {
  const current = state.recordsById[id];
  if (!current?.qrError) return state;
  const { qrError: _error, ...rest } = current;
  return touch(withRecord(state, { ...rest, qrStatus: current.qr.source === "existing" ? "existing" : "pending", updatedAt: now }));
}

// ---------- plantilla y archivo ----------

export function changeTemplate(state: ProjectState, template: Template): ProjectState {
  const result = switchTemplate(template, { layout: state.layout, templateOverrides: state.templateOverrides });
  return touch({ ...state, templateId: template.id, layout: result.layout, templateOverrides: result.templateOverrides });
}

/** Descarta los registros ilegibles apartados (el usuario ya los descargó o no los necesita). */
export function clearQuarantine(state: ProjectState): ProjectState {
  return state.quarantine.length === 0 ? state : touch({ ...state, quarantine: [] });
}

/** Clave de duplicados del proyecto (§1.2-10): al cambiarla, la importación recalcula sus grupos. */
export function setDuplicateKey(state: ProjectState, config: ProjectState["duplicateKey"]): ProjectState {
  return JSON.stringify(state.duplicateKey) === JSON.stringify(config) ? state : touch({ ...state, duplicateKey: config });
}

export function setProjectName(state: ProjectState, name: string): ProjectState {
  return state.name === name ? state : touch({ ...state, name: name.slice(0, 200) });
}

export function toPersisted(state: ProjectState): PersistedProject {
  return { ...state } as PersistedProject;
}
