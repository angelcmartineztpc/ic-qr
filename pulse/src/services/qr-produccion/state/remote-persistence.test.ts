import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";
import type { ProjectState } from "@/types";

import { addRecord, createEmptyProject } from "./project";
import { RemoteProjectPersistence, supabaseProjectTable, type ProjectPatch, type ProjectRow, type ProjectTable, type RemoteStatus } from "./remote-persistence";

/** `qr_proyectos` en memoria con la misma semántica del SQL: el trigger sube la revisión y el UPDATE exige la esperada. */
class MemoryTable implements ProjectTable {
  readonly rows = new Map<string, ProjectRow>();
  calls = { insert: 0, update: 0 };
  failNext: Error | null = null;
  /** Mientras no se abra, el INSERT/UPDATE queda en vuelo (para provocar cambios durante un guardado). */
  gate: Promise<void> = Promise.resolve();

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
  async get(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async latestMine() {
    return structuredClone([...this.rows.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null);
  }
  async insert(row: ProjectPatch & { id: string }) {
    this.calls.insert++;
    await this.gate;
    this.maybeFail();
    if (this.rows.has(row.id)) return "exists" as const;
    const stored: ProjectRow = { ...structuredClone(row), revision: 1, owner_id: "u1", updated_at: new Date().toISOString() };
    this.rows.set(row.id, stored);
    return structuredClone(stored);
  }
  async updateIfRevision(id: string, expectedRevision: number, patch: ProjectPatch) {
    this.calls.update++;
    this.maybeFail();
    const row = this.rows.get(id);
    if (!row || row.revision !== expectedRevision) return null;
    const next: ProjectRow = { ...row, ...structuredClone(patch), revision: row.revision + 1, updated_at: new Date().toISOString() };
    this.rows.set(id, next);
    return structuredClone(next);
  }
}

const base = () => addRecord(createEmptyProject(NOW, { id: "p1", name: "Mesas" }), draft({ mesa: "M1" }), NOW, { id: "a" }).state;
const edited = (project: ProjectState, mesa: string): ProjectState => addRecord(project, draft({ mesa }), NOW, { id: `r-${mesa}` }).state;

function setup(options: ConstructorParameters<typeof RemoteProjectPersistence>[1] = {}) {
  const table = new MemoryTable();
  const statuses: RemoteStatus[] = [];
  const saved: number[] = [];
  const remote = new RemoteProjectPersistence(table, { debounceMs: 1000, retryMs: [100, 200], onStatus: (s) => statuses.push(s), onSaved: (r) => saved.push(r), ...options });
  return { table, remote, statuses, saved };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("guardado con debounce", () => {
  it("anuncia «guardando» al instante, junta los cambios y escribe una sola vez el último estado", async () => {
    const { table, remote, statuses, saved } = setup();
    const p0 = base();
    const p1 = edited(p0, "M2");
    const p2 = edited(p1, "M3");
    remote.schedule(p0);
    remote.schedule(p1);
    remote.schedule(p2);
    expect(statuses).toEqual(["saving"]);
    expect(table.calls.insert).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(table.calls).toEqual({ insert: 1, update: 0 });
    expect(Object.keys((table.rows.get("p1")?.datos as ProjectState).recordsById)).toHaveLength(3);
    expect(statuses).toEqual(["saving", "saved"]);
    expect(saved).toEqual([p2.revision]);
    expect(remote.revision).toBe(1);
  });

  it("el primer guardado inserta (id = projectId) y los siguientes actualizan con la revisión que se leyó", async () => {
    const { table, remote } = setup();
    const p0 = base();
    remote.schedule(p0);
    await remote.flush();
    const p1 = edited(p0, "M2");
    remote.schedule(p1);
    await remote.flush();
    expect(table.calls).toEqual({ insert: 1, update: 1 });
    expect(table.rows.get("p1")).toMatchObject({ revision: 2, nombre: "Mesas", schema_version: 2 });
    expect(remote.revision).toBe(2);
  });

  it("no vuelve a escribir lo que ya está guardado", async () => {
    const { table, remote, statuses } = setup();
    const p0 = base();
    remote.schedule(p0);
    await remote.flush();
    remote.schedule(p0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(table.calls.insert + table.calls.update).toBe(1);
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("los cambios que llegan mientras se guarda se guardan después (nunca se pierde el último)", async () => {
    const { table, remote, saved } = setup();
    const p0 = base();
    let open = () => {};
    table.gate = new Promise<void>((resolve) => (open = resolve));
    remote.schedule(p0);
    const pending = remote.flush();
    await vi.advanceTimersByTimeAsync(0); // el INSERT de p0 ya está en vuelo
    expect(table.calls.insert).toBe(1);
    const p1 = edited(p0, "M2");
    remote.schedule(p1); // llega durante el guardado
    open();
    await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual([p0.revision, p1.revision]);
    expect((table.rows.get("p1")?.datos as ProjectState).order).toHaveLength(2);
  });

  it("un proyecto nuevo se inserta aparte; no actualiza el anterior", async () => {
    const { table, remote } = setup();
    remote.schedule(base());
    await remote.flush();
    remote.schedule(addRecord(createEmptyProject(NOW, { id: "p2" }), draft(), NOW, { id: "z" }).state);
    await remote.flush();
    expect([...table.rows.keys()].sort()).toEqual(["p1", "p2"]);
    expect(table.calls).toEqual({ insert: 2, update: 0 });
  });
});

describe("control de revisión optimista", () => {
  it("si la base cambió desde que se leyó, NO pisa: queda en conflicto y conserva lo pendiente", async () => {
    const { table, remote, statuses } = setup();
    const p0 = base();
    remote.schedule(p0);
    await remote.flush();
    // Otra pestaña o dispositivo guarda antes.
    table.rows.set("p1", { ...(table.rows.get("p1") as ProjectRow), revision: 2, nombre: "De otra pestaña" });
    remote.schedule(edited(p0, "M2"));
    await remote.flush();
    expect(statuses.at(-1)).toBe("conflict");
    expect(table.rows.get("p1")).toMatchObject({ revision: 2, nombre: "De otra pestaña" });
    // Con conflicto no se insiste: ni con más cambios ni con flush.
    remote.schedule(edited(edited(p0, "M2"), "M3"));
    await vi.advanceTimersByTimeAsync(10_000);
    await remote.flush();
    expect(table.calls.update).toBe(1);
    expect(remote.status).toBe("conflict");
  });

  it("«conservar lo mío» guarda encima con la revisión actual; el historial de revisiones sigue avanzando", async () => {
    const { table, remote, statuses } = setup();
    const p0 = base();
    remote.schedule(p0);
    await remote.flush();
    table.rows.set("p1", { ...(table.rows.get("p1") as ProjectRow), revision: 5, nombre: "Ajeno" });
    const mine = edited(p0, "M2");
    remote.schedule(mine);
    await remote.flush();
    expect(remote.status).toBe("conflict");

    await remote.resolveConflict("keep-local");
    expect(remote.status).toBe("saved");
    expect(table.rows.get("p1")).toMatchObject({ revision: 6, nombre: "Mesas" });
    expect((table.rows.get("p1")?.datos as ProjectState).order).toHaveLength(2);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("«tomar lo de la base» descarta lo pendiente y devuelve el proyecto de la base", async () => {
    const { table, remote } = setup();
    const p0 = base();
    remote.schedule(p0);
    await remote.flush();
    const remoteProject = edited(p0, "REMOTO");
    table.rows.set("p1", { ...(table.rows.get("p1") as ProjectRow), revision: 3, datos: structuredClone(remoteProject) });
    remote.schedule(edited(p0, "M2"));
    await remote.flush();

    const loaded = await remote.resolveConflict("take-remote");
    expect(loaded).toMatchObject({ kind: "loaded", revision: 3 });
    expect(remote.status).toBe("saved");
    expect(table.calls.update).toBe(1); // nada más se escribió
    // Y ya se puede seguir editando sobre lo recibido.
    if (loaded?.kind !== "loaded") throw new Error("se esperaba el proyecto");
    remote.schedule(edited(loaded.project, "M9"));
    await remote.flush();
    expect(table.rows.get("p1")?.revision).toBe(4);
  });

  it("insertar un id que ya existe en la base (otro dispositivo lo creó) es un conflicto, no un duplicado", async () => {
    const { table, remote } = setup();
    table.rows.set("p1", { id: "p1", nombre: "Otro", datos: {}, schema_version: 2, revision: 1, owner_id: "u2", updated_at: NOW });
    remote.schedule(base());
    await remote.flush();
    expect(remote.status).toBe("conflict");
    expect(table.rows.get("p1")?.nombre).toBe("Otro");
  });
});

describe("fallos de red", () => {
  it("sin conexión: «offline», reintenta con espera y termina guardando; lo pendiente no se pierde", async () => {
    const { table, remote, statuses } = setup();
    table.failNext = new TypeError("Failed to fetch");
    remote.schedule(base());
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.status).toBe("offline");
    expect(table.rows.size).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(remote.status).toBe("saved");
    expect(table.rows.size).toBe(1);
    expect(statuses).toEqual(["saving", "offline", "saved"]);
  });

  it("un error del servidor queda en «error» tras agotar los reintentos, y un cambio nuevo lo vuelve a intentar", async () => {
    const { table, remote } = setup({ retryMs: [10] });
    const failAlways = () => {
      table.failNext = new Error("500 interno");
    };
    failAlways();
    remote.schedule(base());
    await vi.advanceTimersByTimeAsync(1000);
    failAlways();
    await vi.advanceTimersByTimeAsync(10);
    expect(remote.status).toBe("error");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(table.rows.size).toBe(0);
    remote.schedule(edited(base(), "M2"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.status).toBe("saved");
    expect(table.rows.get("p1")).toBeDefined();
  });

  it("isOffline() decide «offline» aunque el error no parezca de red", async () => {
    const { table, remote } = setup({ isOffline: () => true });
    table.failNext = new Error("boom");
    remote.schedule(base());
    await remote.flush();
    expect(remote.status).toBe("offline");
  });

  it("dispose cancela el guardado programado y los reintentos", async () => {
    const { table, remote } = setup();
    remote.schedule(base());
    remote.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(table.rows.size).toBe(0);
  });
});

describe("carga", () => {
  it("vacío, cargado (recuerda la revisión para no pisar) e ilegible (no se sobrescribe)", async () => {
    const { table, remote } = setup();
    expect(await remote.load()).toEqual({ kind: "empty" });

    const p0 = base();
    table.rows.set("p1", { id: "p1", nombre: "Mesas", datos: structuredClone(p0), schema_version: 2, revision: 7, owner_id: "u1", updated_at: "2026-10-14T12:00:00.000Z" });
    const loaded = await remote.load();
    expect(loaded).toMatchObject({ kind: "loaded", revision: 7, updatedAt: "2026-10-14T12:00:00.000Z" });
    expect(remote.revision).toBe(7);
    remote.schedule(edited(p0, "M2"));
    await remote.flush();
    expect(table.rows.get("p1")?.revision).toBe(8); // actualizó (no insertó) sobre la revisión leída

    table.rows.set("p2", { id: "p2", nombre: "Raro", datos: { schemaVersion: 99 }, schema_version: 99, revision: 1, owner_id: "u1", updated_at: NOW });
    expect(await remote.load("p2")).toEqual({ kind: "invalid", reason: "creado con una versión más reciente" });
  });

  it("un registro ilegible dentro del proyecto va a cuarentena, no tumba la carga", async () => {
    const { table, remote } = setup();
    const p0 = base();
    const datos = structuredClone(p0) as ProjectState;
    datos.recordsById["a"] = { basura: true } as never;
    table.rows.set("p1", { id: "p1", nombre: "Mesas", datos, schema_version: 2, revision: 1, owner_id: "u1", updated_at: NOW });
    const loaded = await remote.load("p1");
    expect(loaded).toMatchObject({ kind: "loaded", quarantined: 1 });
  });
});

describe("supabaseProjectTable (consultas)", () => {
  function fakeClient(result: { data: unknown; error: { code?: string; message: string } | null }, userId: string | null = "u1") {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "insert", "update", "eq", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        calls.push([name, args]);
        return chain;
      };
    }
    chain["maybeSingle"] = async () => result;
    chain["single"] = async () => result;
    return { calls, client: { from: (table: string) => (calls.push(["from", [table]]), chain), auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) } } as never };
  }

  it("la actualización exige id Y revisión (el control optimista es una sola sentencia)", async () => {
    const row = { id: "p1", revision: 2 };
    const { calls, client } = fakeClient({ data: row, error: null });
    expect(await supabaseProjectTable(client).updateIfRevision("p1", 1, { nombre: "x", datos: {}, schema_version: 2 })).toEqual(row);
    expect(calls.filter(([name]) => name === "eq")).toEqual([["eq", ["id", "p1"]], ["eq", ["revision", 1]]]);
    expect(calls[0]).toEqual(["from", ["qr_proyectos"]]);
  });

  it("sin filas devuelve null (conflicto); un error de la base lanza", async () => {
    expect(await supabaseProjectTable(fakeClient({ data: null, error: null }).client).updateIfRevision("p1", 1, { nombre: "", datos: {}, schema_version: 2 })).toBeNull();
    await expect(supabaseProjectTable(fakeClient({ data: null, error: { message: "permission denied" } }).client).get("p1")).rejects.toThrow("permission denied");
  });

  it("insertar un id repetido (23505) es «exists»; latestMine filtra por la persona y ordena por fecha", async () => {
    expect(await supabaseProjectTable(fakeClient({ data: null, error: { code: "23505", message: "duplicate" } }).client).insert({ id: "p1", nombre: "", datos: {}, schema_version: 2 })).toBe("exists");
    const { calls, client } = fakeClient({ data: null, error: null });
    await supabaseProjectTable(client).latestMine();
    expect(calls).toContainEqual(["eq", ["owner_id", "u1"]]);
    expect(calls).toContainEqual(["order", ["updated_at", { ascending: false }]]);
    expect(await supabaseProjectTable(fakeClient({ data: null, error: null }, null).client).latestMine()).toBeNull();
  });
});
