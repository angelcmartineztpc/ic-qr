// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { memoryKv } from "@/services/qr-produccion/test-helpers/render-app";
import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";

import type { ProjectPatch, ProjectRow, ProjectTable } from "./remote-persistence";
import { addRecord } from "./project";
import { useRuntime, StoreProvider, type Runtime } from "./StoreProvider";
import { updateProject } from "./stores";

/** `qr_proyectos` en memoria: el UPDATE exige la revisión esperada y la sube (como el trigger del SQL). */
class MemoryTable implements ProjectTable {
  rows = new Map<string, ProjectRow>();
  async get(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async latestMine() {
    return structuredClone([...this.rows.values()][0] ?? null);
  }
  async insert(row: ProjectPatch & { id: string }) {
    if (this.rows.has(row.id)) return "exists" as const;
    const stored: ProjectRow = { ...structuredClone(row), revision: 1, owner_id: "u1", updated_at: NOW };
    this.rows.set(row.id, stored);
    return structuredClone(stored);
  }
  async updateIfRevision(id: string, expectedRevision: number, patch: ProjectPatch) {
    const row = this.rows.get(id);
    if (!row || row.revision !== expectedRevision) return null;
    const next: ProjectRow = { ...row, ...structuredClone(patch), revision: row.revision + 1 };
    this.rows.set(id, next);
    return structuredClone(next);
  }
}

let runtime: Runtime;
function Grab() {
  runtime = useRuntime();
  return null;
}
const mount = (table: MemoryTable | null) =>
  render(
    <StoreProvider kv={memoryKv()} locks={null} remoteTable={table} remoteDebounceMs={10}>
      <Grab />
    </StoreProvider>,
  );
const addPiece = () => act(() => updateProject(runtime.project, (p) => addRecord(p, draft(), NOW).state));

afterEach(cleanup);

describe("StoreProvider + persistencia remota (DB-first)", () => {
  it("un cambio local se guarda en la base y el estado remoto pasa a «saved»", async () => {
    const table = new MemoryTable();
    mount(table);
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    await waitFor(() => expect(table.rows.size).toBe(1));
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));
    const row = [...table.rows.values()][0]!;
    expect(row.revision).toBe(1);
  });

  it("al abrir, manda la base: el proyecto guardado en otro dispositivo reemplaza el vacío", async () => {
    const table = new MemoryTable();
    const first = mount(table);
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    await waitFor(() => expect(table.rows.size).toBe(1));
    first.unmount();

    mount(table); // otro navegador: caché local vacía
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    expect(runtime.project.getState().project.order).toHaveLength(1);
  });

  it("si otro dispositivo guardó antes, hay conflicto y NO se pisa la base", async () => {
    const table = new MemoryTable();
    mount(table);
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));
    const id = [...table.rows.keys()][0]!;
    const other = table.rows.get(id)!;
    table.rows.set(id, { ...other, nombre: "Desde otro equipo", revision: other.revision + 1 });

    addPiece();
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("conflict"));
    expect(table.rows.get(id)!.nombre).toBe("Desde otro equipo");
  });

  it("sin base (null) solo hay caché local y el estado remoto queda «off»", async () => {
    mount(null);
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    expect(runtime.session.getState().remote.status).toBe("off");
  });
});
