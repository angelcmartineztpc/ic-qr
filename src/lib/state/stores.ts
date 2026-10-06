import { createStore, type StoreApi } from "zustand/vanilla";

import type { SortKey } from "@/lib/records/order";
import type { ProjectState, RecordId } from "@/types";

import type { CounterFilter } from "./counters";
import { createEmptyProject, type Removed } from "./project";
import type { SaveStatus } from "./persistence";
import type { WriterRole } from "./tab-lock";

/** Datos del proyecto: se persisten y se guardan en el archivo `.qrproj.json`. */
export interface ProjectStoreState {
  project: ProjectState;
}

export type ViewMode = "pages" | "grid";

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
