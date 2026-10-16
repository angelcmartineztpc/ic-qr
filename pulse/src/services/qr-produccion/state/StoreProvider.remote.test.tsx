// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { memoryKv } from "@/services/qr-produccion/test-helpers/render-app";
import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";

import { MemoryProjectTable } from "@/services/qr-produccion/test-helpers/memory-project-table";
import { addRecord } from "./project";
import { useRuntime, StoreProvider, type Runtime } from "./StoreProvider";
import { updateProject } from "./stores";

let runtime: Runtime;
function Grab() {
  runtime = useRuntime();
  return null;
}
const mount = (table: MemoryProjectTable | null) =>
  render(
    <StoreProvider kv={memoryKv()} locks={null} remoteTable={table} remoteDebounceMs={10}>
      <Grab />
    </StoreProvider>,
  );
const addPiece = () => act(() => updateProject(runtime.project, (p) => addRecord(p, draft(), NOW).state));

afterEach(cleanup);

describe("StoreProvider + persistencia remota (DB-first)", () => {
  it("un cambio local se guarda en la base y el estado remoto pasa a «saved»", async () => {
    const table = new MemoryProjectTable(NOW);
    mount(table);
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    await waitFor(() => expect(table.rows.size).toBe(1));
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));
    const row = [...table.rows.values()][0]!;
    expect(row.revision).toBe(1);
  });

  it("al abrir, manda la base: el proyecto guardado en otro dispositivo reemplaza el vacío", async () => {
    const table = new MemoryProjectTable(NOW);
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
    const table = new MemoryProjectTable(NOW);
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

describe("pérdida de conexión a mitad de sesión", () => {
  it("la base cae: queda «offline», lo editado sigue en la caché local y al volver la red se sube solo", async () => {
    const table = new MemoryProjectTable(NOW);
    const kv = memoryKv();
    render(
      <StoreProvider kv={kv} locks={null} remoteTable={table} remoteDebounceMs={10} remoteRetryMs={[20, 20, 20, 20]}>
        <Grab />
      </StoreProvider>,
    );
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    addPiece();
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));

    table.offline = true; // se cae la red con la sesión ya abierta
    addPiece();
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("offline"));
    expect(table.rows.size).toBe(1);
    await waitFor(() => expect(kv.data.size).toBeGreaterThan(0)); // IndexedDB sí guardó
    expect(runtime.project.getState().project.order).toHaveLength(2); // nada se perdió en memoria

    table.offline = false;
    await new Promise((resolve) => setTimeout(resolve, 150)); // los reintentos cortos ya se agotaron: nadie vuelve a intentar solo
    expect(runtime.session.getState().remote.status).toBe("offline");
    act(() => void window.dispatchEvent(new Event("online"))); // vuelve la red
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"), { timeout: 2000 });
    const stored = [...table.rows.values()][0]!;
    expect(Object.keys((stored.datos as { recordsById: object }).recordsById)).toHaveLength(2);
  });
});
