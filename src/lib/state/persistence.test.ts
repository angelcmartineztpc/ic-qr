import { describe, expect, it, vi } from "vitest";

import { PROJECT_KEY, createAutosaver, loadProject, saveProject, type KeyValueStore } from "./persistence";
import { addRecord, createEmptyProject } from "./project";
import { draft, generatedRecord, LATER, NOW } from "../../../tests/helpers/records";

function memoryKv(initial: Record<string, unknown> = {}): KeyValueStore & { data: Map<string, unknown>; writes: number } {
  const data = new Map(Object.entries(initial));
  const kv = {
    data,
    writes: 0,
    get: async (key: string) => data.get(key),
    set: async (key: string, value: unknown) => {
      kv.writes++;
      data.set(key, structuredClone(value));
    },
    del: async (key: string) => void data.delete(key),
  };
  return kv;
}

const project = () => addRecord(addRecord(createEmptyProject(NOW, { id: "p1" }), draft({ mesa: "M1" }), NOW, { id: "a" }).state, draft({ mesa: "M2" }), NOW, { id: "b" }).state;

describe("loadProject / saveProject", () => {
  it("sin nada guardado → empty", async () => {
    expect(await loadProject(memoryKv(), LATER)).toEqual({ kind: "empty" });
  });

  it("guardar y cargar conserva el proyecto (AC: el estado se restaura al recargar)", async () => {
    const kv = memoryKv();
    await saveProject(kv, project());
    const out = await loadProject(kv, LATER);
    if (out.kind !== "loaded") throw new Error(out.kind);
    expect(out.project.order).toEqual(["a", "b"]);
    expect(out.project.recordsById["a"]).toMatchObject({ mesa: "M1", qrStatus: "pending" });
    expect(out.quarantined).toBe(0);
  });

  it("recargar NO regenera el QR: un registro con QR generado vuelve igual", async () => {
    const kv = memoryKv();
    const p = project();
    const generated = generatedRecord({ id: "a" });
    await saveProject(kv, { ...p, recordsById: { ...p.recordsById, a: generated } });
    const out = await loadProject(kv, LATER);
    if (out.kind !== "loaded") throw new Error(out.kind);
    expect(out.project.recordsById["a"]).toMatchObject({ qrStatus: "generated", qr: generated.qr, qrUrl: generated.qrUrl });
  });

  it("'generating' nunca se restaura: vuelve a pending", async () => {
    const kv = memoryKv();
    const p = project();
    const a = p.recordsById["a"];
    if (!a) throw new Error("falta a");
    await saveProject(kv, { ...p, recordsById: { ...p.recordsById, a: { ...a, qrStatus: "generating" } } });
    const out = await loadProject(kv, LATER);
    expect(out.kind === "loaded" && out.project.recordsById["a"]?.qrStatus).toBe("pending");
  });

  it("un registro corrupto va a cuarentena y el resto carga intacto; una regla nueva deja el registro visible con errores", async () => {
    const kv = memoryKv();
    const p = project();
    const raw = { ...p, recordsById: { a: { id: "a", area: 5 }, b: { ...p.recordsById["b"], menuUrl: "hola" } } };
    await kv.set(PROJECT_KEY, raw);
    const out = await loadProject(kv, LATER);
    if (out.kind !== "loaded") throw new Error(out.kind);
    expect(out.quarantined).toBe(1);
    expect(out.project.order).toEqual(["b"]);
    expect(out.project.recordsById["b"]?.validationErrors.some((e) => e.severity === "error")).toBe(true);
  });

  it("si la envoltura no se puede leer: copia de seguridad, nunca se pierde ni se pisa en silencio", async () => {
    const kv = memoryKv({ [PROJECT_KEY]: { cualquier: "cosa" } });
    const out = await loadProject(kv, LATER);
    if (out.kind !== "recovered") throw new Error(out.kind);
    expect(out.backupKey).toMatch(/^backup-2026-10-06T11-00-00-000Z$/);
    expect(kv.data.get(out.backupKey)).toEqual({ cualquier: "cosa" });
  });

  it("un proyecto de una versión más reciente se respalda con ese motivo", async () => {
    const kv = memoryKv({ [PROJECT_KEY]: { ...project(), schemaVersion: 99 } });
    const out = await loadProject(kv, LATER);
    expect(out.kind === "recovered" && out.reason).toMatch(/más reciente/);
  });

  it("IndexedDB no disponible → unavailable (se trabaja en memoria con aviso)", async () => {
    const kv: KeyValueStore = { get: async () => Promise.reject(new Error("SecurityError")), set: async () => {}, del: async () => {} };
    expect(await loadProject(kv, LATER)).toEqual({ kind: "unavailable", reason: "SecurityError" });
  });
});

describe("createAutosaver", () => {
  it("agrupa varios cambios en una sola escritura (debounce) y guarda el último estado", async () => {
    vi.useFakeTimers();
    try {
      const kv = memoryKv();
      const statuses: string[] = [];
      const saver = createAutosaver(kv, { debounceMs: 500, onStatus: (s) => statuses.push(s) });
      saver.schedule(createEmptyProject(NOW, { id: "uno" }));
      expect(statuses).toEqual(["saving"]); // «Guardando…» desde el instante del cambio
      await vi.advanceTimersByTimeAsync(300);
      saver.schedule(createEmptyProject(NOW, { id: "dos" }));
      await vi.advanceTimersByTimeAsync(499);
      expect(kv.writes).toBe(0);
      await vi.advanceTimersByTimeAsync(10);
      expect(kv.writes).toBe(1);
      expect((kv.data.get(PROJECT_KEY) as { projectId: string }).projectId).toBe("dos");
      expect(statuses).toEqual(["saving", "ok"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush escribe de inmediato (visibilitychange / pagehide) y no escribe dos veces", async () => {
    const kv = memoryKv();
    const saver = createAutosaver(kv, { debounceMs: 10_000 });
    saver.schedule(project());
    await saver.flush();
    expect(kv.writes).toBe(1);
    await saver.flush();
    expect(kv.writes).toBe(1);
  });

  it("un fallo de escritura se informa (error) y no rompe la app", async () => {
    const statuses: string[] = [];
    const kv: KeyValueStore = { get: async () => undefined, set: async () => Promise.reject(new Error("QuotaExceeded")), del: async () => {} };
    const saver = createAutosaver(kv, { onStatus: (s) => statuses.push(s) });
    saver.schedule(project());
    await saver.flush();
    expect(statuses).toEqual(["saving", "error"]);
  });

  it("dispose descarta lo pendiente", async () => {
    vi.useFakeTimers();
    try {
      const kv = memoryKv();
      const saver = createAutosaver(kv, { debounceMs: 100 });
      saver.schedule(project());
      saver.dispose();
      await vi.advanceTimersByTimeAsync(1000);
      expect(kv.writes).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
