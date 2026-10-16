"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { supabase } from "@/integrations/supabase/client";
import { fetchResolve } from "@/services/qr-produccion/app/api-client";
import { shortenFetcher } from "@/services/qr-produccion/app/links-client";
import { QrInflight } from "@/services/qr-produccion/app/qr-inflight";
import { fetchPreviewTiles, TilePreviewClient } from "@/services/qr-produccion/app/tile-preview-client";
import type { ShortenFetcher } from "@/services/qr-produccion/links/shorten-many";
import type { PreviewResponse } from "@/services/qr-produccion/schemas/preview";
import type { ProjectState } from "@/types";

import { EditorHistory } from "./history";
import { createIdbStore } from "./idb";
import { clearLastImport, loadLastImport, saveLastImport, type LastImport } from "./last-import";
import { createAutosaver, loadProject, type KeyValueStore } from "./persistence";
import { createEmptyProject, isDirty, orderedRecords } from "./project";
import { createProjectStore, createSessionStore, isGenerating, patchSession, type ProjectStore, type SessionState, type SessionStore } from "./stores";
import { RemoteProjectPersistence, supabaseProjectTable, type ProjectTable } from "./remote-persistence";
import { createWriterLock, type LockManagerLike } from "./tab-lock";

export interface Runtime {
  project: ProjectStore;
  session: SessionStore;
  inflight: QrInflight;
  tiles: TilePreviewClient;
  fetchResolve: typeof fetchResolve;
  /** Acorta los links del menú (siempre, para que el QR sea legible y estable). */
  fetchShorten: ShortenFetcher;
  /** Guarda ya (antes de salir) y devuelve cuando terminó. */
  flush(): Promise<void>;
  takeOver(): Promise<void>;
  /** Conflicto con la base: «keep-local» sobrescribe con lo local; «take-remote» adopta lo de la base. */
  resolveConflict(choice: "keep-local" | "take-remote"): Promise<void>;
  /** Copia de seguridad que se hizo al no poder leer el proyecto guardado (para ofrecerla en descarga). */
  readBackup(key: string): Promise<unknown>;
  /** Último resultado de importación (IndexedDB, clave `last-import`). */
  lastImport: { save(value: LastImport): Promise<void>; clear(): Promise<void> };
  /** Archivo Excel de la importación en curso: no es serializable, vive solo en memoria (para reenviarlo con otro mapeo) y el Link del menú común elegido. */
  importSource: { file: File | null; defaultMenuUrl: string };
  /** Deshacer/rehacer del editor visual. */
  history: EditorHistory;
}

const RuntimeContext = createContext<Runtime | null>(null);

export interface StoreProviderProps {
  children: ReactNode;
  /** Solo para pruebas: almacén y bloqueos inyectables. */
  kv?: KeyValueStore;
  locks?: LockManagerLike | null;
  fetchResolve?: Runtime["fetchResolve"];
  fetchShorten?: Runtime["fetchShorten"];
  fetchTiles?: (request: Parameters<ConstructorParameters<typeof TilePreviewClient>[0]>[0], signal?: AbortSignal) => Promise<PreviewResponse>;
  initialProject?: ProjectState;
  /** Tabla `qr_proyectos`. Por defecto Supabase; con null, o en pruebas con `kv`, solo hay caché local. */
  remoteTable?: ProjectTable | null;
  /** Solo para pruebas. */
  remoteDebounceMs?: number;
}

export function StoreProvider({ children, kv, locks, fetchResolve: resolver, fetchShorten: shortener, fetchTiles, initialProject, remoteTable, remoteDebounceMs }: StoreProviderProps) {
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const takeOverRef = useRef<() => Promise<void>>(async () => undefined);
  const readBackupRef = useRef<(key: string) => Promise<unknown>>(async () => undefined);
  const resolveConflictRef = useRef<(choice: "keep-local" | "take-remote") => Promise<void>>(async () => undefined);
  const lastImportRef = useRef<Runtime["lastImport"]>({ save: async () => undefined, clear: async () => undefined });

  // Una sola vez por montaje: el runtime (stores, QR en curso, caché de piezas) es estable.
  const [rt] = useState<Runtime>(() => ({
    project: createProjectStore(initialProject ?? createEmptyProject(new Date().toISOString())),
    session: createSessionStore(initialProject ? { hydrated: true } : {}),
    inflight: new QrInflight(),
    tiles: new TilePreviewClient(fetchTiles ?? ((request, signal) => fetchPreviewTiles(request, signal))),
    fetchResolve: resolver ?? fetchResolve,
    fetchShorten: shortener ?? shortenFetcher,
    flush: () => flushRef.current(),
    takeOver: () => takeOverRef.current(),
    resolveConflict: (choice) => resolveConflictRef.current(choice),
    readBackup: (key) => readBackupRef.current(key),
    lastImport: { save: (value) => lastImportRef.current.save(value), clear: () => lastImportRef.current.clear() },
    importSource: { file: null, defaultMenuUrl: "" },
    history: new EditorHistory(),
  }));

  useEffect(() => {
    const store = kv ?? createIdbStore();
    const writerLocks = locks === undefined ? (typeof navigator !== "undefined" && window.isSecureContext ? (navigator.locks as unknown as LockManagerLike | undefined) : undefined) : (locks ?? undefined);
    let disposed = false;

    const local = createAutosaver(store, {
      onStatus: (status) => patchSession(rt.session, (s) => (s.persistence.status === "unavailable" ? {} : { persistence: { status } })),
    });
    // DB-first: la base (qr_proyectos) es la fuente de verdad; IndexedDB es caché para recargas y desconexiones.
    const table = remoteTable === undefined ? (kv === undefined ? supabaseProjectTable(supabase) : null) : remoteTable;
    const remote = table
      ? new RemoteProjectPersistence(table, {
          ...(remoteDebounceMs === undefined ? {} : { debounceMs: remoteDebounceMs }),
          isOffline: () => typeof navigator !== "undefined" && navigator.onLine === false,
          onStatus: (status, detail) => patchSession(rt.session, { remote: { status, ...(detail ? { detail } : {}) } }),
        })
      : null;
    const saver = {
      schedule: (project: ProjectState) => {
        local.schedule(project);
        remote?.schedule(project);
      },
      flush: async () => {
        await Promise.all([local.flush(), remote?.flush()]);
      },
      dispose: () => {
        local.dispose();
        remote?.dispose();
      },
    };
    resolveConflictRef.current = async (choice) => {
      const loaded = (await remote?.resolveConflict(choice)) ?? null;
      if (loaded?.kind === "loaded") rt.project.setState({ project: loaded.project });
    };
    flushRef.current = () => saver.flush();

    readBackupRef.current = (key) => store.get(key);
    lastImportRef.current = {
      save: async (value) => {
        try {
          await saveLastImport(store, value);
        } catch {
          /* sin almacenamiento: el resultado sigue en memoria, solo no sobrevive a recargar */
        }
      },
      clear: async () => {
        try {
          await clearLastImport(store);
        } catch {
          /* idem */
        }
      },
    };

    /**
     * Al pasar de solo lectura a escritora (tomar el control) el proyecto en memoria puede estar
     * viejo: la otra pestaña pudo guardar mientras tanto. Se recarga lo guardado ANTES de poder
     * editar, o esta pestaña pisaría esos cambios. La pestaña anterior hace su último guardado
     * al perder el bloqueo; la breve espera deja que termine.
     */
    const refreshFromStorage = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (disposed) return;
      const outcome = await loadProject(store, new Date().toISOString());
      if (!disposed && outcome.kind === "loaded") rt.project.setState({ project: outcome.project });
    };
    const lock = createWriterLock((writer) => {
      const previous = rt.session.getState().writer;
      patchSession(rt.session, { writer });
      if (writer === "read-only") void saver.flush(); // último guardado de lo pendiente antes de ceder
      if (writer === "owner" && previous === "read-only" && rt.session.getState().hydrated) void refreshFromStorage();
    }, writerLocks ?? undefined);
    takeOverRef.current = () => lock.takeOver();
    patchSession(rt.session, { lockSupported: lock.supported });

    // Cada cambio del proyecto se programa para guardarse, solo si esta pestaña es la escritora.
    const unsubscribeProject = rt.project.subscribe((state, previous) => {
      if (state.project.projectId !== previous.project.projectId) rt.history.clear(); // otro proyecto: no se puede «deshacer» hacia el anterior
      const session = rt.session.getState();
      if (!session.hydrated || session.writer !== "owner" || session.persistence.status === "unavailable") return;
      if (state.project !== previous.project) saver.schedule(state.project);
    });
    const unsubscribeInflight = rt.inflight.subscribe((ids) => patchSession(rt.session, { inFlight: ids }));

    void (async () => {
      await lock.start();
      if (initialProject) return;
      const now = new Date().toISOString();
      let outcome = await loadProject(store, now);
      let pushLocal = false;
      if (disposed) return;
      if (remote) {
        // Sin conexión o con error se sigue con la caché local; con proyecto en la base, manda la base,
        // salvo que la caché local sea del mismo proyecto y más nueva (cambios sin subir): entonces gana la local.
        const fromDb = await remote.load(undefined, now).catch(() => null);
        if (disposed) return;
        if (fromDb?.kind === "loaded") {
          const localNewer = outcome.kind === "loaded" && outcome.project.projectId === fromDb.project.projectId && outcome.project.revision > fromDb.project.revision;
          if (localNewer) pushLocal = true;
          else outcome = { kind: "loaded", project: fromDb.project, quarantined: fromDb.quarantined };
        } else if (fromDb?.kind === "empty" && outcome.kind === "loaded") pushLocal = true; // primer uso con la base: se sube lo local
      }
      void loadLastImport(store).then((last) => {
        if (disposed || !last || rt.session.getState().import.status !== "idle") return;
        patchSession(rt.session, (s) => ({ import: { ...s.import, status: last.outcome ? "done" : "review", result: last.result, outcome: last.outcome } }));
      });
      switch (outcome.kind) {
        case "loaded": {
          rt.project.setState({ project: outcome.project });
          if (pushLocal && rt.session.getState().writer === "owner") remote?.schedule(outcome.project);
          const count = orderedRecords(outcome.project).length;
          patchSession(rt.session, { hydrated: true, notices: { restored: count > 0 ? { records: count, modifiedAt: outcome.project.lastLocalSaveAt ?? now } : null, quarantined: outcome.project.quarantine.length, recoveredBackup: null } });
          break;
        }
        case "recovered":
          patchSession(rt.session, { hydrated: true, notices: { restored: null, quarantined: 0, recoveredBackup: outcome.backupKey } });
          break;
        case "unavailable":
          patchSession(rt.session, { hydrated: true, persistence: { status: "unavailable" } });
          break;
        default: {
          patchSession(rt.session, { hydrated: true });
          // Si la persona ya abrió o creó piezas mientras se leía el almacenamiento (el autoguardado esperaba a la hidratación), se guardan ahora.
          const early = rt.project.getState().project;
          if (early.order.length > 0 && rt.session.getState().writer === "owner") saver.schedule(early);
        }
      }
    })();

    const onHide = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Solo el diálogo nativo del navegador: no admite texto ni botones propios.
      if (isDirty(rt.project.getState().project) || rt.inflight.ids().length > 0 || isGenerating(rt.session.getState().generation)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onPageHide = () => void saver.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      disposed = true;
      unsubscribeProject();
      unsubscribeInflight();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void saver.flush();
      saver.dispose();
      lock.release();
    };
    // El runtime es estable; kv/locks/initialProject solo se leen al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <RuntimeContext.Provider value={rt}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useRuntime debe usarse dentro de <StoreProvider>");
  return runtime;
}

/** Suscripción a una parte del proyecto. El selector debe devolver una referencia estable (usa useShallow si construye arrays/objetos). */
export function useProject<T>(selector: (project: ProjectState) => T): T {
  const { project } = useRuntime();
  return useStore(project, (s) => selector(s.project));
}

export function useSession<T>(selector: (session: SessionState) => T): T {
  const { session } = useRuntime();
  return useStore(session, selector);
}
