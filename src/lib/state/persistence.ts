/**
 * Persistencia local (§S6): IndexedDB vía una interfaz clave-valor inyectable
 * (las pruebas usan memoria). Solo DATOS: nunca SVG, matrices ni PDF.
 * Hidratación tolerante: lo ilegible va a cuarentena o a una copia de seguridad,
 * jamás se descarta un proyecto en silencio.
 */
import { hydrateRecords } from "@/lib/records/hydrate";
import { PersistedProjectSchema, PROJECT_SCHEMA_VERSION } from "@/schemas/project";
import { getTemplate } from "@/templates";
import type { ProjectState } from "@/types";

import { toPersisted } from "./project";

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export const PROJECT_KEY = "project";

export type LoadOutcome =
  | { kind: "empty" }
  | { kind: "loaded"; project: ProjectState; quarantined: number }
  /** La envoltura no se pudo leer: copia de seguridad + proyecto vacío (con aviso permanente). */
  | { kind: "recovered"; backupKey: string; reason: string }
  /** IndexedDB no está disponible: se trabaja solo en memoria. */
  | { kind: "unavailable"; reason: string };

export async function loadProject(kv: KeyValueStore, now: string): Promise<LoadOutcome> {
  let raw: unknown;
  try {
    raw = await kv.get(PROJECT_KEY);
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof Error ? error.message : "IndexedDB no disponible" };
  }
  if (raw === undefined || raw === null) return { kind: "empty" };

  const declared = (raw as { schemaVersion?: unknown }).schemaVersion;
  const parsed = PersistedProjectSchema.safeParse(raw);
  const template = parsed.success ? getTemplate(parsed.data.templateId) : undefined;
  if (!parsed.success || !template || parsed.data.layout.templateId !== parsed.data.templateId) {
    const reason = typeof declared === "number" && declared > PROJECT_SCHEMA_VERSION ? "creado con una versión más reciente" : parsed.success ? "plantilla desconocida" : (parsed.error.issues[0]?.message ?? "formato no válido");
    const backupKey = `backup-${now.replace(/[:.]/g, "-")}`;
    try {
      await kv.set(backupKey, raw);
    } catch {
      /* si ni la copia se puede guardar, el aviso lo dice igualmente */
    }
    return { kind: "recovered", backupKey, reason };
  }

  const hydrated = hydrateRecords(parsed.data.recordsById, parsed.data.order, now);
  const project: ProjectState = { ...parsed.data, recordsById: hydrated.recordsById, order: hydrated.order, quarantine: [...parsed.data.quarantine, ...hydrated.quarantine] };
  return { kind: "loaded", project, quarantined: hydrated.quarantine.length };
}

export async function saveProject(kv: KeyValueStore, project: ProjectState): Promise<void> {
  await kv.set(PROJECT_KEY, toPersisted(project));
}

export type SaveStatus = "ok" | "saving" | "error";

export interface Autosaver {
  schedule(project: ProjectState): void;
  /** Escribe ya (visibilitychange / pagehide). */
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Escritura con debounce (200 ms por defecto); siempre se guarda el último estado
 * recibido. «saving» se anuncia en el instante del cambio —no al empezar a
 * escribir—: mientras esté visible, lo último aún no está a salvo en el navegador.
 */
export function createAutosaver(kv: KeyValueStore, options: { debounceMs?: number; onStatus?: (status: SaveStatus) => void } = {}): Autosaver {
  const debounceMs = options.debounceMs ?? 200;
  let pending: ProjectState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const write = async (): Promise<void> => {
    const project = pending;
    pending = null;
    if (!project) return;
    try {
      await saveProject(kv, project);
      options.onStatus?.("ok");
    } catch {
      options.onStatus?.("error");
    }
  };

  return {
    schedule(project) {
      if (pending === null) options.onStatus?.("saving");
      pending = project;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        running = running.then(write);
      }, debounceMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      running = running.then(write);
      await running;
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
