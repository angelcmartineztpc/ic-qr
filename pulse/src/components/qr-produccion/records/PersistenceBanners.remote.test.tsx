// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addRecord } from "@/services/qr-produccion/state/project";
import { useRuntime, type Runtime } from "@/services/qr-produccion/state/StoreProvider";
import { updateProject } from "@/services/qr-produccion/state/stores";
import { MemoryProjectTable } from "@/services/qr-produccion/test-helpers/memory-project-table";
import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";
import { renderApp } from "@/services/qr-produccion/test-helpers/render-app";

import type { BuilderActions } from "./builder-actions";
import { PersistenceBanners } from "./PersistenceBanners";

let runtime: Runtime;
function Harness() {
  runtime = useRuntime();
  return <PersistenceBanners actions={{} as BuilderActions} />;
}
const addPiece = () => act(() => updateProject(runtime.project, (p) => addRecord(p, draft(), NOW).state));

/** Deja el proyecto guardado en la base y luego provoca un conflicto escribiendo desde «otro equipo». */
async function conflictOn(table: MemoryProjectTable) {
  renderApp(<Harness />, { remoteTable: table, remoteDebounceMs: 10, remoteRetryMs: [] });
  await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
  addPiece();
  await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));
  const [id, row] = [...table.rows.entries()][0]!;
  table.rows.set(id, { ...row, nombre: "Desde otro equipo", datos: { ...(row.datos as object), name: "Desde otro equipo" }, revision: row.revision + 1 });
  addPiece();
  await screen.findByText(/cambió en otro lugar/);
}

describe("avisos de guardado en la nube", () => {
  it("conflicto: muestra el aviso y «Conservar lo mío» sobrescribe la base con lo local", async () => {
    const table = new MemoryProjectTable(NOW);
    await conflictOn(table);
    await userEvent.click(screen.getByRole("button", { name: "Conservar lo mío" }));
    await waitFor(() => expect(runtime.session.getState().remote.status).toBe("saved"));
    expect(screen.queryByText(/cambió en otro lugar/)).toBeNull();
    const stored = [...table.rows.values()][0]!;
    expect(Object.keys((stored.datos as { recordsById: object }).recordsById)).toHaveLength(2);
  });

  it("conflicto: «Usar lo guardado» descarta lo local y adopta lo de la base", async () => {
    const table = new MemoryProjectTable(NOW);
    await conflictOn(table);
    await userEvent.click(screen.getByRole("button", { name: "Usar lo guardado" }));
    await waitFor(() => expect(screen.queryByText(/cambió en otro lugar/)).toBeNull());
    expect(runtime.project.getState().project.name).toBe("Desde otro equipo");
    expect(runtime.project.getState().project.order).toHaveLength(1); // la 2.ª pieza local se descartó
  });

  it("sin conexión: avisa que los cambios quedan en este navegador", async () => {
    const table = new MemoryProjectTable(NOW);
    renderApp(<Harness />, { remoteTable: table, remoteDebounceMs: 10, remoteRetryMs: [] });
    await waitFor(() => expect(runtime.session.getState().hydrated).toBe(true));
    table.offline = true;
    addPiece();
    expect(await screen.findByText(/Sin conexión: tus cambios se guardan en este navegador/)).toBeTruthy();
  });
});
