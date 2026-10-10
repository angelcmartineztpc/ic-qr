import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addRecord, applyResolutions, createEmptyProject, markSaved } from "@/lib/state/project";
import { saveProject } from "@/lib/state/persistence";

import { draft, generatedSource, NOW } from "../../../tests/helpers/records";
import { heldLocks, memoryKv, renderApp } from "../../../tests/helpers/render-app";
import { EditorScreen } from "./EditorScreen";

const MENU = "https://menu.example.com/tropical";

async function fillForm(user: ReturnType<typeof userEvent.setup>, values: { area?: string; mesa?: string; menuUrl?: string; qrUrl?: string; estacion?: string }) {
  const dialog = await screen.findByRole("dialog");
  const field = (name: RegExp) => within(dialog).getByRole("textbox", { name });
  if (values.area !== undefined) await user.type(field(/^Área/), values.area);
  if (values.estacion !== undefined) await user.type(field(/^Estación/), values.estacion);
  if (values.mesa !== undefined) await user.type(field(/^Mesa/), values.mesa);
  if (values.menuUrl !== undefined) await user.type(field(/^Link del menú/), values.menuUrl);
  if (values.qrUrl !== undefined) await user.type(field(/^Link del QR/), values.qrUrl);
  return dialog;
}

async function addPiece(user: ReturnType<typeof userEvent.setup>, values: Parameters<typeof fillForm>[1]) {
  await user.click(screen.getAllByRole("button", { name: /\+ Agregar nuevo/ })[0] as HTMLElement);
  const dialog = await fillForm(user, values);
  await user.click(within(dialog).getByRole("button", { name: "Agregar pieza" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

function seeded(count: number) {
  let project = createEmptyProject(NOW, { id: "p1", name: "Tropical" });
  for (let i = 1; i <= count; i++) project = addRecord(project, draft({ mesa: `M${i}`, menuUrl: `${MENU}?m=${i}` }), NOW, { id: `r${i}` }).state;
  return markSaved(project, NOW);
}

describe("builder — estado vacío", () => {
  it("muestra cómo empezar: agregar o importar", async () => {
    renderApp(<EditorScreen />);
    expect(await screen.findByRole("heading", { name: "Aún no hay piezas" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /\+ Agregar nuevo/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Importar Excel/ }).length).toBeGreaterThan(0);
  });
});

describe("crear una pieza manualmente (AC1, AC2, AC13, AC17–AC19)", () => {
  it("el formulario valida los obligatorios y los campos son de texto libre", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />);
    await user.click((await screen.findAllByRole("button", { name: /\+ Agregar nuevo/ }))[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Agregar nueva pieza" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar pieza" }));
    expect(await within(dialog).findByText("El área es obligatoria")).toBeTruthy();
    expect(within(dialog).getByText("La mesa es obligatoria")).toBeTruthy();
    expect(within(dialog).getByText("El link del menú es obligatorio")).toBeTruthy();
    // Opcionales: sin error aunque estén vacíos.
    expect(within(dialog).queryByText(/Sub-grupo vacío|Concepto vacío|Estación vacío/)).toBeNull();
  });

  it("agrega una pieza con mesa de formato libre, la muestra y genera su QR", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />);
    await screen.findByRole("heading", { name: "Aún no hay piezas" });
    await addPiece(user, { area: "Tropical", mesa: "Terraza 4", menuUrl: MENU });

    expect(await screen.findByTestId("piece-position")).toHaveProperty("textContent", "Pieza 1 de 1");
    expect(screen.getAllByText("Terraza 4").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByTestId("qr-status")[0]?.textContent).toMatch(/✓ QR generado/));
    expect(screen.getByTestId("counter-all").textContent).toBe("Total: 1");
    expect(screen.getByTestId("counter-withQr").textContent).toBe("Con QR: 1");
    expect(screen.getByTestId("counter-needQr").textContent).toBe("Necesitan QR: 0");
  });

  it("con Link del QR queda como QR existente (no se genera) (AC12, AC30)", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />);
    await screen.findByRole("heading", { name: "Aún no hay piezas" });
    await addPiece(user, { area: "Tropical", mesa: "M1", menuUrl: MENU, qrUrl: "https://qr.cliente.com/m1.svg" });
    await waitFor(() => expect(screen.getAllByTestId("qr-status")[0]?.textContent).toMatch(/✓ QR existente/));
    const detail = screen.getByRole("region", { name: "Pieza seleccionada" });
    expect(within(detail).getByRole("link", { name: "https://qr.cliente.com/m1.svg" })).toBeTruthy();
    expect(within(detail).getByRole("link", { name: MENU })).toBeTruthy();
  });

  it("agregar varias piezas y navegar entre ellas: «Pieza N de M»", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />);
    await screen.findByRole("heading", { name: "Aún no hay piezas" });
    for (const mesa of ["M1", "M2", "M3"]) await addPiece(user, { area: "Tropical", mesa, menuUrl: `${MENU}?${mesa}` });
    expect(screen.getByTestId("piece-position").textContent).toBe("Pieza 3 de 3");
    await user.click(screen.getByRole("button", { name: "Pieza anterior" }));
    expect(screen.getByTestId("piece-position").textContent).toBe("Pieza 2 de 3");
    await user.click(screen.getByRole("button", { name: "Pieza siguiente" }));
    expect(screen.getByTestId("piece-position").textContent).toBe("Pieza 3 de 3");
    expect((screen.getByRole("button", { name: "Pieza siguiente" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("editar, duplicar y eliminar (AC3, AC4)", () => {
  it("editar cambia los datos de la pieza", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(1) });
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar pieza" });
    const mesa = within(dialog).getByRole("textbox", { name: /^Mesa/ });
    await user.clear(mesa);
    await user.type(mesa, "VIP-A");
    await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const detail = screen.getByRole("region", { name: "Pieza seleccionada" });
    expect(within(detail).getByText("VIP-A")).toBeTruthy();
  });

  it("duplicar añade una copia", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(1) });
    await user.click(await screen.findByRole("button", { name: "Duplicar" }));
    expect(await screen.findByText(/Pieza duplicada/)).toBeTruthy();
    expect(screen.getByTestId("counter-all").textContent).toBe("Total: 2");
  });

  it("eliminar SIEMPRE pregunta; confirmar quita la pieza y [Deshacer] la devuelve", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(2) });
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/¿Eliminar la pieza M1 · Tropical\?/)).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "No volver a preguntar en esta sesión" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.getByTestId("counter-all").textContent).toBe("Total: 1"));
    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(screen.getByTestId("counter-all").textContent).toBe("Total: 2"));
  });

  it("cancelar la confirmación no borra nada", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(2) });
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("counter-all").textContent).toBe("Total: 2");
  });
});

describe("filtros, búsqueda, vistas y paginación", () => {
  it("el contador «Necesitan QR» filtra la lista y se puede quitar", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(3) });
    await screen.findByTestId("counter-needQr");
    expect(screen.getByTestId("counter-needQr").textContent).toBe("Necesitan QR: 3");
    await user.click(screen.getByTestId("counter-withQr"));
    expect(await screen.findByText(/Ninguna pieza coincide/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(await screen.findByTestId("piece-position")).toBeTruthy();
  });

  it("buscar por mesa", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(3) });
    await user.type(await screen.findByRole("searchbox", { name: "Buscar pieza" }), "M2");
    await waitFor(() => expect(screen.getByTestId("piece-position").textContent).toBe("Pieza 1 de 1"));
  });

  it("vista de rejilla con paginación «Página N de M» (1000 piezas, AC: sin renderizar todo)", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(100) });
    await user.click(await screen.findByRole("button", { name: /^Todas/ }));
    expect(screen.getAllByTestId("record-card")).toHaveLength(24); // solo la página visible
    expect(screen.getByTestId("page-position").textContent).toBe("Página 1 de 5");
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(screen.getByTestId("page-position").textContent).toBe("Página 2 de 5");
    expect(screen.getAllByTestId("record-card")[0]?.getAttribute("data-record-id")).toBe("r25");
  });
});

describe("persistencia y avisos (spec §37, §38)", () => {
  it("restaura el proyecto guardado SIN regenerar ningún QR y avisa", async () => {
    const kv = memoryKv();
    await saveProject(kv, seeded(2));
    let resolved = 0;
    renderApp(<EditorScreen />, { kv, initialProject: undefined, fetchResolve: async () => (resolved++, { results: [], created: 0, reused: 0, failed: 0 }) });
    expect(await screen.findByText(/Proyecto restaurado: 2 piezas/)).toBeTruthy();
    expect(screen.getByTestId("counter-all").textContent).toBe("Total: 2");
    expect(resolved).toBe(0);
  });

  it("los cambios se guardan en el navegador (IndexedDB) y se ve el estado de guardado", async () => {
    const user = userEvent.setup();
    const kv = memoryKv();
    renderApp(<EditorScreen />, { kv });
    await screen.findByRole("heading", { name: "Aún no hay piezas" });
    await addPiece(user, { area: "Tropical", mesa: "M1", menuUrl: MENU });
    expect(screen.getByTestId("dirty-chip").textContent).toBe("Cambios sin descargar");
    await waitFor(() => expect((kv.data.get("project") as { order: string[] } | undefined)?.order.length).toBe(1), { timeout: 3000 });
  });

  it("si otra pestaña escribe, esta queda en solo lectura con «Tomar el control»", async () => {
    renderApp(<EditorScreen />, { locks: heldLocks, initialProject: undefined });
    expect(await screen.findByText(/abierto en otra pestaña y aquí solo puedes verlo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tomar el control" })).toBeTruthy();
    expect((screen.getAllByRole("button", { name: /\+ Agregar nuevo/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("si IndexedDB no está disponible, lo dice y ofrece guardar en archivo", async () => {
    renderApp(<EditorScreen />, { kv: { get: async () => Promise.reject(new Error("SecurityError")), set: async () => {}, del: async () => {} } });
    expect(await screen.findByText(/no permite guardar en local/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar proyecto" })).toBeTruthy();
  });

  it("un proyecto ilegible se respalda y se avisa (nunca se pierde en silencio)", async () => {
    renderApp(<EditorScreen />, { kv: memoryKv({ project: { cualquier: "cosa" } }) });
    expect(await screen.findByText(/No se pudo leer el proyecto guardado/)).toBeTruthy();
  });

  it("los registros ilegibles van a cuarentena y se avisa", async () => {
    const project = seeded(1);
    renderApp(<EditorScreen />, { kv: memoryKv({ project: { ...project, recordsById: { ...project.recordsById, roto: { id: "roto", area: 5 } }, order: ["r1", "roto"] } }) });
    expect(await screen.findByText(/1 pieza no se pudo leer y se apartó/)).toBeTruthy();
    expect(screen.getByTestId("counter-all").textContent).toBe("Total: 1");
  });
});

describe("descargas y avisos con acciones (§S6)", () => {
  const downloads: Array<{ name: string; blob: Blob }> = [];
  beforeEach(() => {
    downloads.length = 0;
    const blobs = new Map<string, Blob>();
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob as Blob);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ name: this.download, blob: blobs.get(this.href) as Blob });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** Una pieza con QR generado y vigente: exportable. */
  function withGeneratedQr() {
    const base = addRecord(createEmptyProject(NOW, { id: "p" }), draft({ mesa: "M1", menuUrl: MENU }), NOW, { id: "r1" }).state;
    const resolution = { recordId: "r1", outcome: "generated" as const, qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(MENU) };
    return applyResolutions(base, [resolution], new Map([["r1", { menuUrl: MENU }]]), NOW).state;
  }

  it("«Descargar SVG» (menú de la tarjeta) de una pieza con el QR pendiente avisa en lugar de descargar", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: seeded(1) });
    await user.click(await screen.findByRole("button", { name: "Más acciones de M1 · Tropical" }));
    await user.click(await screen.findByRole("menuitem", { name: "Descargar SVG" }));
    expect(await screen.findByText(/Resuelve el QR y los errores de M1 · Tropical antes de descargar su SVG/)).toBeTruthy();
    expect(downloads).toHaveLength(0);
  });

  it("«Descargar SVG» (menú de la tarjeta) de una pieza lista descarga el SVG dibujado por el servidor, con su nombre", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { initialProject: withGeneratedQr() });
    await user.click(await screen.findByRole("button", { name: "Más acciones de M1 · Tropical" }));
    await user.click(await screen.findByRole("menuitem", { name: "Descargar SVG" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]?.name).toBe("M1-Tropical.svg");
    expect(await (downloads[0] as { blob: Blob }).blob.text()).toContain("<title>M1</title>"); // el SVG que devolvió el servidor
    expect(await screen.findByText("SVG descargado: M1-Tropical.svg")).toBeTruthy();
  });

  it("la cuarentena ofrece Ver, Descargar y Descartar", async () => {
    const user = userEvent.setup();
    const project = seeded(1);
    renderApp(<EditorScreen />, { kv: memoryKv({ project: { ...project, recordsById: { ...project.recordsById, roto: { id: "roto", area: 5 } }, order: ["r1", "roto"] } }) });
    expect(await screen.findByText(/1 pieza no se pudo leer y se apartó/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver" }));
    const dialog = await screen.findByRole("dialog", { name: /Piezas dañadas que se apartaron \(1\)/ });
    expect(within(dialog).getByText(/"area": 5/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Descargar" }));
    await waitFor(() => expect(downloads[0]?.name).toBe("registros-ilegibles.json"));
    expect(JSON.parse(await (downloads[0] as { blob: Blob }).blob.text())).toMatchObject({ format: "qr-production-quarantine", entries: [{ raw: { id: "roto" } }] });

    await user.click(screen.getByRole("button", { name: "Descartar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByText(/no se pudo leer/)).toBeNull());
  });

  it("si el proyecto guardado no se pudo leer, se ofrece descargar la copia de seguridad", async () => {
    const user = userEvent.setup();
    renderApp(<EditorScreen />, { kv: memoryKv({ project: { cualquier: "cosa" } }) });
    await screen.findByText(/No se pudo leer el proyecto guardado/);
    await user.click(screen.getByRole("button", { name: "Descargar copia" }));
    await waitFor(() => expect(downloads[0]?.name).toMatch(/^copia-backup-.*\.json$/));
    expect(JSON.parse(await (downloads[0] as { blob: Blob }).blob.text())).toEqual({ cualquier: "cosa" });
  });
});
