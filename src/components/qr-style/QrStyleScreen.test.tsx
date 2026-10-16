import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addRecord, createEmptyProject, markSaved } from "@/lib/state/project";

import { draft, NOW } from "../../../tests/helpers/records";
import { heldLocks, renderApp } from "../../../tests/helpers/render-app";
import { QrStyleScreen } from "./QrStyleScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/style" }));

const MENU = "https://menu.example.com/tropical";
function seeded(count: number, extra: Parameters<typeof draft>[0] = {}) {
  let project = createEmptyProject(NOW, { id: "p1", name: "Tropical" });
  for (let i = 1; i <= count; i++) project = addRecord(project, draft({ mesa: `M${i}`, menuUrl: `${MENU}?m=${i}` }), NOW, { id: `r${i}` }).state;
  if (Object.keys(extra).length > 0) project = addRecord(project, draft({ mesa: "X", menuUrl: `${MENU}?x=1`, ...extra }), NOW, { id: "rx" }).state;
  return markSaved(project, NOW);
}
const preview = async () => (await screen.findByTestId("qr-style-preview")) as HTMLImageElement;
const decoded = (img: HTMLImageElement) => decodeURIComponent(img.src);

afterEach(() => vi.unstubAllGlobals());

describe("paso «Estilo del QR»", () => {
  it("sin piezas ofrece ir a crearlas", async () => {
    renderApp(<QrStyleScreen />);
    expect(await screen.findByRole("heading", { name: "Aún no hay piezas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a las piezas" }).getAttribute("href")).toBe("/editor");
  });

  it("muestra el QR clásico, las opciones y la navegación del paso", async () => {
    renderApp(<QrStyleScreen />, { initialProject: seeded(3) });
    const img = await preview();
    expect(decoded(img)).toContain('id="qr-code"');
    // Contorno, módulos, marco y centro de las esquinas parten de «Cuadrado».
    expect(screen.getAllByRole("radio", { name: "Cuadrado", checked: true })).toHaveLength(4);
    for (const name of ["Puntos", "Hoja", "Hoja suave", "Muy redondeado", "Círculo"]) expect(screen.getAllByRole("radio", { name }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Piezas" }).getAttribute("href")).toBe("/editor");
    expect(screen.getByRole("link", { name: "Siguiente: Diseño" }).getAttribute("href")).toBe("/preview");
    expect(screen.getByRole("button", { name: "Restablecer al QR clásico" }).hasAttribute("disabled")).toBe(true);
  });

  it("elegir una forma cambia la vista previa al instante y habilita «Restablecer»", async () => {
    const user = userEvent.setup();
    renderApp(<QrStyleScreen />, { initialProject: seeded(2) });
    const before = decoded(await preview());
    await user.click(screen.getByRole("radio", { name: "Puntos" }));
    await waitFor(async () => expect(decoded(await preview())).not.toBe(before));
    expect(screen.getByRole("radio", { name: "Puntos" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Restablecer al QR clásico" }).hasAttribute("disabled")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Restablecer al QR clásico" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Puntos" }).getAttribute("aria-checked")).toBe("false"));
    await waitFor(async () => expect(decoded(await preview())).toBe(before));
  });

  it("deshacer y rehacer recorren los cambios de estilo", async () => {
    const user = userEvent.setup();
    renderApp(<QrStyleScreen />, { initialProject: seeded(1) });
    await preview();
    await user.click(screen.getByRole("radio", { name: "Puntos" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Puntos" }).getAttribute("aria-checked")).toBe("true"));
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Puntos" }).getAttribute("aria-checked")).toBe("false"));
    await user.click(screen.getByRole("button", { name: "Rehacer" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Puntos" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("un color con contraste casi nulo muestra un error de legibilidad", async () => {
    renderApp(<QrStyleScreen />, { initialProject: seeded(1) });
    await preview();
    fireEvent.change(screen.getByLabelText("Módulos (hexadecimal)"), { target: { value: "#EEEEEE" } });
    await waitFor(() => expect(screen.getAllByTestId("qr-style-warning")[0]?.textContent).toMatch(/casi no se distingue/), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText("Módulos (hexadecimal)"), { target: { value: "#000000" } });
    await waitFor(() => expect(screen.queryAllByTestId("qr-style-warning")).toHaveLength(0), { timeout: 2000 });
  });

  it("las piezas con Link del QR avisan de que conservan su QR y no se muestran como ejemplo", async () => {
    renderApp(<QrStyleScreen />, { initialProject: seeded(1, { qrUrl: "https://assets.example.com/qr/x.svg" }) });
    await preview();
    expect((await screen.findByTestId("existing-note")).textContent).toMatch(/1 pieza trae su propio QR/);
  });

  it("subir un logo lo envía al servidor para sanearlo y lo dibuja en el QR; se puede quitar", async () => {
    const user = userEvent.setup();
    const geometry = { viewBox: [0, 0, 100, 100], nodes: [{ type: "rect", x: 0, y: 0, w: 100, h: 100, fill: "#112233" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ geometry }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderApp(<QrStyleScreen />, { initialProject: seeded(1) });
    await preview();
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'], "marca.svg", { type: "image/svg+xml" });
    await user.upload(screen.getByTestId("logo-input"), file);
    expect((await screen.findByTestId("logo-name")).textContent).toBe("marca.svg");
    await waitFor(async () => expect(decoded(await preview())).toContain('id="qr-logo"'));
    expect(fetchMock).toHaveBeenCalledWith("/api/qr/logo", expect.objectContaining({ method: "POST" }));

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(screen.queryByTestId("logo-name")).toBeNull());
    await waitFor(async () => expect(decoded(await preview())).not.toContain('id="qr-logo"'));
  });

  it("un archivo que no es .svg se rechaza en el navegador sin llamar al servidor", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderApp(<QrStyleScreen />, { initialProject: seeded(1) });
    await preview();
    await user.upload(screen.getByTestId("logo-input"), new File(["x"], "marca.png", { type: "image/png" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/\.svg/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza el SVG se muestra su explicación y no queda logo", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "VALIDATION_FAILED", message: "No se pudo usar el SVG: Elemento no admitido: <script>" }), { status: 400, headers: { "Content-Type": "application/json" } })));
    renderApp(<QrStyleScreen />, { initialProject: seeded(1) });
    await preview();
    await user.upload(screen.getByTestId("logo-input"), new File(["<svg/>"], "malo.svg", { type: "image/svg+xml" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Elemento no admitido/);
    expect(screen.queryByTestId("logo-name")).toBeNull();
  });

  it("en solo lectura (otra pestaña edita) los controles están desactivados", async () => {
    renderApp(<QrStyleScreen />, { initialProject: seeded(1), locks: heldLocks });
    await preview();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Puntos" }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Subir logo (SVG)" }).hasAttribute("disabled")).toBe(true);
  });
});
