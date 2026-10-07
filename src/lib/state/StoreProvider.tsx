"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { fetchResolve, postJson } from "@/lib/app/api-client";
import { QrInflight } from "@/lib/app/qr-inflight";
import { TilePreviewClient } from "@/lib/app/tile-preview-client";
import type { PreviewResponse } from "@/schemas/preview";
import type { ProjectState } from "@/types";

import { createIdbStore } from "./idb";
import { createAutosaver, loadProject, type KeyValueStore } from "./persistence";
import { createEmptyProject, isDirty, orderedRecords } from "./project";
import { createProjectStore, createSessionStore, patchSession, type ProjectStore, type SessionState, type SessionStore } from "./stores";
import { createWriterLock, type LockManagerLike } from "./tab-lock";

export interface Runtime {
  project: ProjectStore;
  session: SessionStore;
  inflight: QrInflight;
  tiles: TilePreviewClient;
  fetchResolve: typeof fetchResolve;
  /** Guarda ya (antes de salir) y devuelve cuando terminó. */
  flush(): Promise<void>;
  takeOver(): Promise<void>;
  /** Copia de seguridad que se hizo al no poder leer el proyecto guardado (para ofrecerla en descarga). */
  readBackup(key: string): Promise<unknown>;
}

const RuntimeContext = createContext<Runtime | null>(null);

export interface StoreProviderProps {
  children: ReactNode;
  /** Solo para pruebas: almacén y bloqueos inyectables. */
  kv?: KeyValueStore;
  locks?: LockManagerLike | null;
  fetchResolve?: Runtime["fetchResolve"];
  fetchTiles?: (request: Parameters<ConstructorParameters<typeof TilePreviewClient>[0]>[0], signal?: AbortSignal) => Promise<PreviewResponse>;
  initialProject?: ProjectState;
}

export function StoreProvider({ children, kv, locks, fetchResolve: resolver, fetchTiles, initialProject }: StoreProviderProps) {
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const takeOverRef = useRef<() => Promise<void>>(async () => undefined);
  const readBackupRef = useRef<(key: string) => Promise<unknown>>(async () => undefined);

  // Una sola vez por montaje: el runtime (stores, QR en curso, caché de piezas) es estable.
  const [rt] = useState<Runtime>(() => ({
    project: createProjectStore(initialProject ?? createEmptyProject(new Date().toISOString())),
    session: createSessionStore(initialProject ? { hydrated: true } : {}),
    inflight: new QrInflight(),
    tiles: new TilePreviewClient(fetchTiles ?? ((request, signal) => postJson<PreviewResponse>("/api/preview/tiles", request, signal))),
    fetchResolve: resolver ?? fetchResolve,
    flush: () => flushRef.current(),
    takeOver: () => takeOverRef.current(),
    readBackup: (key) => readBackupRef.current(key),
  }));

  useEffect(() => {
    const store = kv ?? createIdbStore();
    const writerLocks = locks === undefined ? (typeof navigator !== "undefined" && window.isSecureContext ? (navigator.locks as unknown as LockManagerLike | undefined) : undefined) : (locks ?? undefined);
    let disposed = false;

    const saver = createAutosaver(store, {
      onStatus: (status) => patchSession(rt.session, (s) => (s.persistence.status === "unavailable" ? {} : { persistence: { status } })),
    });
    flushRef.current = () => saver.flush();

    readBackupRef.current = (key) => store.get(key);

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
      const session = rt.session.getState();
      if (!session.hydrated || session.writer !== "owner" || session.persistence.status === "unavailable") return;
      if (state.project !== previous.project) saver.schedule(state.project);
    });
    const unsubscribeInflight = rt.inflight.subscribe((ids) => patchSession(rt.session, { inFlight: ids }));

    void (async () => {
      await lock.start();
      if (initialProject) return;
      const now = new Date().toISOString();
      const outcome = await loadProject(store, now);
      if (disposed) return;
      switch (outcome.kind) {
        case "loaded": {
          rt.project.setState({ project: outcome.project });
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
        default:
          patchSession(rt.session, { hydrated: true });
      }
    })();

    const onHide = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Solo el diálogo nativo del navegador: no admite texto ni botones propios.
      if (isDirty(rt.project.getState().project) || rt.inflight.ids().length > 0) {
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
