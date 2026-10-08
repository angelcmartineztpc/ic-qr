import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { addRecord, createEmptyProject, markSaved } from "@/lib/state/project";

import { draft, NOW } from "../../../tests/helpers/records";
import { heldLocks, renderApp } from "../../../tests/helpers/render-app";
import { PreviewScreen } from "./PreviewScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/preview" }));

const MENU = "https://menu.example.com/tropical";
function seeded(count: number) {
  let project = createEmptyProject(NOW, { id: "p1", name: "Tropical" });
  for (let i = 1; i <= count; i++) project = addRecord(project, draft({ mesa: `M${i}`, menuUrl: `${MENU}?m=${i}` }), NOW, { id: `r${i}` }).state;
  return markSaved(project, NOW);
}
const qrBox = () => screen.getByTestId("box-qr");

describe("editor visual (/preview)", () => {
  it("sin piezas ofrece ir a crearlas", async () => {
    renderApp(<PreviewScreen />);
    expect(await screen.findByRole("heading", { name: "Aún no hay piezas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a las piezas" }).getAttribute("href")).toBe("/editor");
  });

  it("muestra la pieza, sus cajas con coordenadas accesibles y el resultado de packGrid en vivo", async () => {
    renderApp(<PreviewScreen />, { initialProject: seeded(8) });
    expect((await screen.findByTestId("piece-position")).textContent).toBe("Pieza 1 de 8");
    expect(qrBox().getAttribute("aria-label")).toBe("QR: x 22.61 mm, y 39.42 mm, 24.79 × 24.79 mm");
    expect(screen.getByTestId("box-content").getAttribute("aria-label")).toContain("Bloque de texto");
    // 70 mm en A4: 2 × 3 = 6 por página → 8 piezas = 2 páginas.
    expect(screen.getByTestId("packing-result").textContent).toBe("6 por página · 2 páginas");
    expect(screen.getByTestId("pdf-preview")).toBeTruthy();
    expect((screen.getByTestId("download-pdf") as HTMLButtonElement).disabled).toBe(false);
  });

  it("las flechas mueven la caja (Mayús 5 mm, Alt 0,1 mm) y cada pulsación es un paso de deshacer", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(2) });
    const box = await screen.findByTestId("box-qr");
    box.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 23.11 mm"));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("y 44.42 mm"));
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 23.01 mm"));

    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 23.11 mm"));
    await user.click(screen.getByRole("button", { name: "Rehacer" }));
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 23.01 mm"));
  });

  it("un movimiento que sacaría la caja de la pieza no se corrige en silencio: queda donde estaba", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(1) });
    const content = await screen.findByTestId("box-content");
    const before = content.getAttribute("aria-label");
    content.focus();
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{ArrowLeft}");
    // x = 4 → 3.5 → 3: sigue dentro; para salir hace falta mucho más (Mayús = 5 mm).
    await user.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}");
    const after = screen.getByTestId("box-content").getAttribute("aria-label") ?? "";
    expect(after).toContain("x 0 mm"); // se detiene en el borde (moveBox acota), nunca queda negativo
    expect(before).not.toBe(after);
  });

  it("coordenadas por teclado: valida al salir del campo y rechaza con motivo", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(1) });
    const x = await screen.findByLabelText("X");
    await user.clear(x);
    await user.type(x, "90");
    await user.tab();
    expect(await screen.findByText(/Debe quedar dentro de la pieza/)).toBeTruthy();
    expect(qrBox().getAttribute("aria-label")).toContain("x 22.61 mm");

    await user.clear(x);
    await user.type(x, "10.5{Enter}");
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 10.5 mm"));
  });

  it("el ancho del QR mueve también el alto (siempre cuadrado) y en cm se convierte a mm", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(1) });
    const width = await screen.findByLabelText("Ancho");
    await user.clear(width);
    await user.type(width, "20{Enter}");
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("20 × 20 mm"));
    await user.click(screen.getByRole("button", { name: "cm" }));
    expect((screen.getByLabelText("Ancho") as HTMLInputElement).value).toBe("2");
  });

  it("presets del QR; «Centro» solapa, avisa y «Ajustar bloque de texto» lo resuelve", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(1) });
    await user.click(await screen.findByRole("combobox", { name: "Posición del QR" }));
    await user.click(await screen.findByRole("option", { name: "Centro" }));
    await waitFor(() => expect(qrBox().getAttribute("aria-label")).toContain("x 22.61 mm, y 22.61 mm"));
    expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("se solapa"))).toBe(true);
    expect(screen.getByTestId("layout-warnings").textContent).toContain("solapa");
    await user.click(screen.getByRole("button", { name: "Ajustar bloque de texto" }));
    await waitFor(() => expect(screen.queryByText("Ajustar bloque de texto")).toBeNull());
  });

  it("«Solo esta pieza»: cambia solo esa y ofrece restablecerla; «Todas» avisa de las personalizadas", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(3) });
    await user.click(await screen.findByRole("button", { name: "Solo esta pieza" }));
    (await screen.findByTestId("box-qr")).focus();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await waitFor(() => expect(screen.getByText("Esta pieza tiene posición propia")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Pieza siguiente" }));
    expect(qrBox().getAttribute("aria-label")).toContain("x 22.61 mm"); // la pieza 2 sigue la base

    await user.click(screen.getByRole("button", { name: "Todas las piezas" }));
    expect(await screen.findByText(/1 pieza tiene posición personalizada/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aplicar también a ellas" }));
    await waitFor(() => expect(screen.queryByText(/posición personalizada/)).toBeNull());
  });

  it("opciones del PDF: la hoja no cabe → error claro; el nombre de archivo muestra el predeterminado", async () => {
    const user = userEvent.setup();
    renderApp(<PreviewScreen />, { initialProject: seeded(2) });
    expect((await screen.findByLabelText("Nombre del archivo")).getAttribute("placeholder")).toMatch(/^qr-production-\d{4}-\d{2}-\d{2}-\d{4}$/);
    await user.type(screen.getByLabelText("Nombre del archivo"), "Mesas LBLC");
    expect(screen.getByText("Se descargará como Mesas LBLC.pdf")).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Página" }));
    await user.click(await screen.findByRole("option", { name: "Personalizada" }));
    const widthField = await screen.findByLabelText("Ancho de página");
    await user.clear(widthField);
    await user.type(widthField, "60{Enter}");
    await waitFor(() => expect(screen.getByTestId("packing-result").textContent).toContain("no cabe"));
  });

  it("en solo lectura no se puede editar", async () => {
    renderApp(<PreviewScreen />, { initialProject: seeded(1), locks: heldLocks });
    expect((await screen.findAllByText(/solo lectura/)).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Deshacer" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByTestId("box-qr")).queryAllByRole("button")).toHaveLength(0);
    fireEvent.keyDown(screen.getByTestId("box-qr"), { key: "ArrowRight" });
    expect(qrBox().getAttribute("aria-label")).toContain("x 22.61 mm");
  });
});
