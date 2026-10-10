import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { addRecord, createEmptyProject, markSaved } from "@/lib/state/project";

import { draft, NOW } from "../../../tests/helpers/records";
import { heldLocks, renderApp } from "../../../tests/helpers/render-app";
import { ExportScreen } from "./ExportScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/export" }));

const MENU = "https://menu.example.com/tropical";
function seeded(count: number) {
  let project = createEmptyProject(NOW, { id: "p1", name: "Tropical" });
  for (let i = 1; i <= count; i++) project = addRecord(project, draft({ mesa: `M${i}`, menuUrl: `${MENU}?m=${i}` }), NOW, { id: `r${i}` }).state;
  return markSaved(project, NOW);
}

describe("paso 3: exportar", () => {
  it("sin piezas ofrece volver al primer paso", async () => {
    renderApp(<ExportScreen />);
    expect(await screen.findByRole("heading", { name: "Aún no hay piezas que exportar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a las piezas" }).getAttribute("href")).toBe("/editor");
  });

  it("resume qué se exporta, muestra el resultado de packGrid en vivo y las hojas", async () => {
    renderApp(<ExportScreen />, { initialProject: seeded(8) });
    expect((await screen.findByTestId("export-summary")).textContent).toContain("8 piezas");
    expect(screen.getByTestId("export-summary").textContent).toContain("8 (se generan al descargar)");
    // 70 mm en A4: 2 × 3 = 6 por página → 8 piezas = 2 páginas.
    expect(screen.getByTestId("packing-result").textContent).toBe("6 por página · 2 páginas");
    expect(screen.getByTestId("pdf-preview")).toBeTruthy();
    expect((screen.getByTestId("download-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("link", { name: "Diseño" }).getAttribute("href")).toBe("/preview");
  });

  it("la hoja no cabe → error claro; el nombre del archivo muestra el predeterminado y el que se escribe", async () => {
    const user = userEvent.setup();
    renderApp(<ExportScreen />, { initialProject: seeded(2) });
    const name = await screen.findByLabelText("Nombre del archivo");
    expect(name.getAttribute("placeholder")).toMatch(/^qr-production-\d{4}-\d{2}-\d{2}-\d{4}$/);
    await user.type(name, "Mesas LBLC");
    expect(screen.getByText("Se descargará como Mesas LBLC.pdf")).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Página" }));
    await user.click(await screen.findByRole("option", { name: "Personalizada" }));
    const widthField = await screen.findByLabelText("Ancho de página");
    await user.clear(widthField);
    await user.type(widthField, "60{Enter}");
    await waitFor(() => expect(screen.getByTestId("packing-result").textContent).toContain("no cabe"));
  });

  it("el formato ZIP añade la opción de nombre de cada SVG", async () => {
    const user = userEvent.setup();
    renderApp(<ExportScreen />, { initialProject: seeded(3) });
    await screen.findByTestId("export-summary");
    expect(screen.getByTestId("export-summary").textContent).toContain("3 piezas");
    await user.click(screen.getByLabelText("También un ZIP con un SVG por pieza"));
    expect(screen.getByLabelText("Nombre de cada SVG")).toBeTruthy();
  });

  it("en solo lectura no se puede descargar", async () => {
    renderApp(<ExportScreen />, { initialProject: seeded(1), locks: heldLocks });
    expect((await screen.findAllByText(/solo lectura/)).length).toBeGreaterThan(0);
    expect((screen.getByTestId("download-pdf") as HTMLButtonElement).disabled).toBe(true);
  });
});
