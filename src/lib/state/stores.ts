import { createStore, type StoreApi } from "zustand/vanilla";

import type { ImportOutcomeSummary } from "./last-import";
import type { SortKey } from "@/lib/records/order";
import type { DuplicateDecision, DuplicateStrategy, ImportIssue, ImportResult, ProjectState, RecordId } from "@/types";

import type { CounterFilter } from "./counters";
import { createEmptyProject, type Removed } from "./project";
import type { SaveStatus } from "./persistence";
import type { WriterRole } from "./tab-lock";

/** Datos del proyecto: se persisten y se guardan en el archivo `.qrproj.json`. */
export interface ProjectStoreState {
  project: ProjectState;
}

export type ViewMode = "pages" | "grid";

/** Importación de Excel en curso o recién terminada (spec §S1). Solo `result` y `outcome` se persisten (clave `last-import`). */
export interface ImportSession {
  status: "idle" | "uploading" | "review" | "done" | "error";
  result: ImportResult | null;
  strategy: DuplicateStrategy;
  decisions: Record<number, DuplicateDecision>;
  mode: "append" | "replace";
  /** Crear también las filas con error como piezas a corregir. */
  includeRejected: boolean;
  /** Cuando ya se confirmó: lo que se creó y lo que se descartó. */
  outcome: ImportOutcomeSummary | null;
  error: { message: string; issues: ImportIssue[]; canTruncate: boolean } | null;
}

export const initialImport = (): ImportSession => ({ status: "idle", result: null, strategy: "keep", decisions: {}, mode: "append", includeRejected: false, outcome: null, error: null });

/** Generación y descarga del PDF (§S5). Solo de sesión; los Blob no se serializan. */
export interface GenerationState {
  phase: "idle" | "resolving" | "generating" | "preparing" | "downloading" | "done" | "cancelled" | "error";
  done: number;
  total: number;
  bytes: number;
  size: number;
  /** Resultado de la última descarga correcta (para «Descargar ZIP»). */
  result: { pieces: number; pages: number; warnings: number; zip: { name: string; blob: Blob } | null } | null;
}

export const initialGeneration = (): GenerationState => ({ phase: "idle", done: 0, total: 0, bytes: 0, size: 0, result: null });
export const isGenerating = (g: Pick<GenerationState, "phase">): boolean => g.phase === "resolving" || g.phase === "generating" || g.phase === "preparing" || g.phase === "downloading";

/** Piezas que bloquean la exportación y se muestran en el diálogo (§1.2-22). */
export interface ExportReview {
  blocked: Array<{ recordId: string; reason: string }>;
}

/** Estado del editor visual (/preview). Solo de sesión. */
export interface EditorUiState {
  scope: "all" | "single";
  /** Caja seleccionada para los paneles de coordenadas y las flechas. */
  box: "qr" | "content";
  showGrid: boolean;
  gridMm: 1 | 2 | 5;
  snap: boolean;
  /** Unidad de los campos de coordenadas. */
  unit: "mm" | "cm";
}

export const initialEditor = (): EditorUiState => ({ scope: "all", box: "qr", showGrid: false, gridMm: 5, snap: true, unit: "mm" });

export interface SessionState {
  /** Se terminó de leer IndexedDB (hasta entonces la pantalla muestra un esqueleto). */
  hydrated: boolean;
  writer: WriterRole;
  /** Web Locks disponible: sin él no se puede garantizar un único escritor. */
  lockSupported: boolean;
  persistence: { status: SaveStatus | "unavailable" };
  selection: { currentId: RecordId | null; page: number; pageSize: number; view: ViewMode };
  filter: CounterFilter;
  query: string;
  sortKey: SortKey | null;
  /** Piezas excluidas de la exportación (Fase 9). */
  excluded: RecordId[];
  /** «No volver a preguntar en esta sesión» al borrar una pieza. */
  confirmDeletes: boolean;
  /** Último borrado, para [Deshacer]. */
  lastDeleted: Removed | null;
  /** Piezas cuyo QR se está resolviendo ahora mismo. */
  inFlight: RecordId[];
  qrProgress: { running: boolean; done: number; total: number };
  import: ImportSession;
  editor: EditorUiState;
  generation: GenerationState;
  exportReview: ExportReview | null;
  /** Avisos persistentes de la hidratación. */
  notices: { restored: { records: number; modifiedAt: string } | null; quarantined: number; recoveredBackup: string | null };
}

export const initialSession = (): SessionState => ({
  hydrated: false,
  writer: "owner",
  lockSupported: false,
  persistence: { status: "ok" },
  selection: { currentId: null, page: 1, pageSize: 24, view: "pages" },
  filter: "all",
  query: "",
  sortKey: null,
  excluded: [],
  confirmDeletes: true,
  lastDeleted: null,
  inFlight: [],
  qrProgress: { running: false, done: 0, total: 0 },
  import: initialImport(),
  editor: initialEditor(),
  generation: initialGeneration(),
  exportReview: null,
  notices: { restored: null, quarantined: 0, recoveredBackup: null },
});

export type ProjectStore = StoreApi<ProjectStoreState>;
export type SessionStore = StoreApi<SessionState>;

export const createProjectStore = (project: ProjectState = createEmptyProject(new Date().toISOString())): ProjectStore => createStore<ProjectStoreState>(() => ({ project }));
export const createSessionStore = (overrides: Partial<SessionState> = {}): SessionStore => createStore<SessionState>(() => ({ ...initialSession(), ...overrides }));

/** Aplica una transformación pura al proyecto. */
export function updateProject(store: ProjectStore, transform: (project: ProjectState) => ProjectState): void {
  store.setState((s) => {
    const next = transform(s.project);
    return next === s.project ? s : { project: next };
  });
}

export function patchSession(store: SessionStore, patch: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>)): void {
  store.setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
}
