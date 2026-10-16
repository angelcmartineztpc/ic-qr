/**
 * Persistencia remota DB-first del proyecto en `qr_proyectos` (Supabase). Complementa la caché local de IndexedDB
 * (`persistence.ts`): IndexedDB sigue guardándose a los 200 ms para sobrevivir a una recarga o a una desconexión, y
 * esta guarda en la base con debounce y CONTROL DE REVISIÓN OPTIMISTA: la actualización solo se aplica si la fila sigue
 * en la revisión que esta pestaña leyó; si otra persona o dispositivo guardó antes, hay conflicto y NO se pisa nada.
 *
 * Misma forma que `Autosaver` (`schedule` / `flush` / `dispose`): se puede sustituir o componer con el de IndexedDB.
 * Lógica pura sobre el puerto `ProjectTable`; el adaptador de supabase-js es `supabaseProjectTable`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { PROJECT_SCHEMA_VERSION } from "@/services/qr-produccion/schemas/project";
import type { ProjectState } from "@/types";

import { hydrateProject } from "./persistence";
import { toPersisted } from "./project";

/** Fila de `qr_proyectos` (ver patch-qr-produccion.sql). */
export interface ProjectRow {
  id: string;
  nombre: string;
  datos: unknown;
  schema_version: number;
  revision: number;
  owner_id: string;
  updated_at: string;
}

export interface ProjectPatch {
  nombre: string;
  datos: unknown;
  schema_version: number;
}

export interface ProjectTable {
  get(id: string): Promise<ProjectRow | null>;
  /** El proyecto más reciente de la persona (la app trabaja con uno). */
  latestMine(): Promise<ProjectRow | null>;
  /** INSERT; «exists» si ya hay una fila con ese id. */
  insert(row: ProjectPatch & { id: string }): Promise<ProjectRow | "exists">;
  /** UPDATE … WHERE id = ? AND revision = ?: null si ya no coincide (o la fila no es visible). */
  updateIfRevision(id: string, expectedRevision: number, patch: ProjectPatch): Promise<ProjectRow | null>;
}

export type RemoteStatus = "idle" | "saving" | "saved" | "conflict" | "offline" | "error";

export type RemoteLoad =
  | { kind: "empty" }
  | { kind: "loaded"; project: ProjectState; revision: number; updatedAt: string; quarantined: number }
  /** La fila existe pero no se entiende (formato nuevo, plantilla desconocida): no se toca ni se sobrescribe. */
  | { kind: "invalid"; reason: string };

export interface RemoteOptions {
  debounceMs?: number;
  /** Esperas entre reintentos tras un fallo (ms). Agotadas, queda en «offline»/«error» hasta el siguiente cambio. */
  retryMs?: readonly number[];
  onStatus?(status: RemoteStatus, detail?: string): void;
  /** Se llama con la revisión del CLIENTE (`project.revision`) que ya está a salvo en la base. */
  onSaved?(clientRevision: number): void;
  isOffline?(): boolean;
}

const DEFAULTS = { debounceMs: 1500, retryMs: [2000, 5000, 15000] } as const;

const isNetworkFailure = (error: unknown): boolean => error instanceof TypeError || (error instanceof Error && /fetch|network|timeout|offline/i.test(error.message));

export class RemoteProjectPersistence {
  private trackedId: string | null = null;
  private serverRevision: number | null = null;
  private savedClientRevision: number | null = null;
  private pending: ProjectState | null = null;
  private lastProject: ProjectState | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  private running: Promise<void> = Promise.resolve();
  private conflicted = false;
  private disposed = false;
  private currentStatus: RemoteStatus = "idle";

  constructor(
    private readonly table: ProjectTable,
    private readonly options: RemoteOptions = {},
  ) {}

  get status(): RemoteStatus {
    return this.currentStatus;
  }

  /** Revisión de la fila en la base (null = el proyecto aún no existe allí). */
  get revision(): number | null {
    return this.serverRevision;
  }

  private setStatus(status: RemoteStatus, detail?: string): void {
    this.currentStatus = status;
    this.options.onStatus?.(status, detail);
  }

  // ---------- carga ----------

  /** Carga un proyecto (por id, o el más reciente de la persona) y recuerda su revisión para los guardados siguientes. */
  async load(id?: string, now: string = new Date().toISOString()): Promise<RemoteLoad> {
    const row = id === undefined ? await this.table.latestMine() : await this.table.get(id);
    return this.adopt(row, now);
  }

  private adopt(row: ProjectRow | null, now: string): RemoteLoad {
    if (!row) return { kind: "empty" };
    const outcome = hydrateProject(row.datos, now);
    if (outcome.kind === "invalid") return outcome;
    this.trackedId = row.id;
    this.serverRevision = row.revision;
    this.savedClientRevision = outcome.project.revision;
    this.conflicted = false;
    return { kind: "loaded", project: outcome.project, revision: row.revision, updatedAt: row.updated_at, quarantined: outcome.quarantined };
  }

  // ---------- guardado (misma forma que Autosaver) ----------

  schedule(project: ProjectState): void {
    if (this.disposed) return;
    this.lastProject = project;
    if (this.isSaved(project)) return;
    if (this.pending === null) this.setStatus(this.conflicted ? "conflict" : "saving");
    this.pending = project;
    if (this.conflicted) return; // no se guarda hasta resolver el conflicto
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retries = 0;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.enqueue();
    }, this.options.debounceMs ?? DEFAULTS.debounceMs);
  }

  /** Guarda ya (visibilitychange / pagehide / cerrar el proyecto). No lanza: el resultado está en `status`. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.enqueue();
    await this.running;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = undefined;
    this.pending = null;
  }

  private isSaved(project: ProjectState): boolean {
    return this.trackedId === project.projectId && this.savedClientRevision === project.revision && this.serverRevision !== null;
  }

  private enqueue(): void {
    this.running = this.running.then(() => this.drain());
  }

  private async drain(): Promise<void> {
    const project = this.pending;
    if (!project || this.conflicted || this.disposed) return;
    this.pending = null;
    try {
      await this.saveOnce(project);
    } catch (error) {
      this.pending ??= project; // se conserva lo último que no llegó a la base
      this.fail(error);
    }
  }

  private async saveOnce(project: ProjectState): Promise<void> {
    const patch: ProjectPatch = { nombre: project.name, datos: toPersisted(project), schema_version: PROJECT_SCHEMA_VERSION };
    // Otro proyecto (se creó o se abrió uno nuevo): se inserta, no se actualiza el anterior.
    if (this.trackedId !== project.projectId) this.serverRevision = null;

    let saved: ProjectRow | null;
    if (this.serverRevision === null) {
      const inserted = await this.table.insert({ id: project.projectId, ...patch });
      saved = inserted === "exists" ? null : inserted;
    } else {
      saved = await this.table.updateIfRevision(project.projectId, this.serverRevision, patch);
    }

    if (!saved) {
      // Otra pestaña o dispositivo guardó antes (o la fila ya no es visible): NO se pisa.
      this.conflicted = true;
      this.pending = project;
      this.setStatus("conflict", "El proyecto cambió en otro lugar mientras lo editabas");
      return;
    }
    this.trackedId = saved.id;
    this.serverRevision = saved.revision;
    this.savedClientRevision = project.revision;
    this.retries = 0;
    // Si llegaron cambios mientras se guardaba, el debounce ya los programó: sigue «guardando».
    this.setStatus(this.pending === null ? "saved" : "saving");
    this.options.onSaved?.(project.revision);
  }

  private fail(error: unknown): void {
    const offline = (this.options.isOffline?.() ?? false) || isNetworkFailure(error);
    this.setStatus(offline ? "offline" : "error", error instanceof Error ? error.message : String(error));
    const delays = this.options.retryMs ?? DEFAULTS.retryMs;
    const wait = delays[this.retries];
    if (wait === undefined || this.disposed) return; // agotados: espera al siguiente cambio de la persona
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.enqueue();
    }, wait);
  }

  // ---------- conflicto ----------

  /**
   * «Conservar lo mío» (`keep-local`): se adopta la revisión actual de la base y se vuelve a guardar encima.
   * «Tomar lo de la base» (`take-remote`): se descarta lo pendiente y se devuelve el proyecto de la base para aplicarlo.
   */
  async resolveConflict(choice: "keep-local" | "take-remote", now: string = new Date().toISOString()): Promise<RemoteLoad | null> {
    const id = this.pending?.projectId ?? this.lastProject?.projectId ?? this.trackedId;
    if (!id) return null;
    const row = await this.table.get(id);
    if (choice === "take-remote") {
      this.pending = null;
      const loaded = this.adopt(row, now);
      this.setStatus(loaded.kind === "loaded" ? "saved" : "idle");
      return loaded;
    }
    this.conflicted = false;
    this.trackedId = id;
    this.serverRevision = row ? row.revision : null; // fila borrada: se vuelve a crear
    this.setStatus("saving");
    this.enqueue();
    await this.running;
    return null;
  }
}

// ---------- adaptador de supabase-js ----------

const COLUMNS = "id, nombre, datos, schema_version, revision, owner_id, updated_at";

/** `qr_proyectos` sobre el cliente singleton de PULSE. Las políticas RLS deciden qué filas se ven y se escriben. */
export function supabaseProjectTable(client: Pick<SupabaseClient, "from" | "auth">): ProjectTable {
  const table = () => client.from("qr_proyectos");
  return {
    async get(id) {
      const { data, error } = await table().select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProjectRow | null;
    },
    async latestMine() {
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) return null;
      const { data, error } = await table().select(COLUMNS).eq("owner_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProjectRow | null;
    },
    async insert(row) {
      const { data, error } = await table().insert(row).select(COLUMNS).single();
      if (!error) return data as ProjectRow;
      if (error.code === "23505") return "exists"; // unique_violation: el id ya existe
      throw new Error(error.message);
    },
    async updateIfRevision(id, expectedRevision, patch) {
      const { data, error } = await table().update(patch).eq("id", id).eq("revision", expectedRevision).select(COLUMNS).maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProjectRow | null;
    },
  };
}
