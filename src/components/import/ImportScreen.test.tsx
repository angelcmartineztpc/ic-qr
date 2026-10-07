import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectHeaderRow } from "@/lib/excel/headers";
import { buildImportResult } from "@/lib/excel/import-pipeline";
import type { RawCell, RawSheet } from "@/lib/excel/types";
import { LAST_IMPORT_KEY } from "@/lib/state/last-import";
import type { ImportResult } from "@/types";

import { heldLocks, memoryKv, renderApp } from "../../../tests/helpers/render-app";
import { ImportScreen } from "./ImportScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/import" }));

const s = (v: string): RawCell => ({ t: "s", v, w: v });
const HEADER = ["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR"].map(s);
const row = (area: string, mesa: string, menu: string, qr = ""): Array<RawCell | null> => [s(area), null, s(mesa), null, null, s(menu), qr ? s(qr) : null];

function excel(header: RawCell[], rows: Array<Array<RawCell | null>>): ImportResult {
  const sheet: RawSheet = { name: "Mesas", state: "visible", rows: [header, ...rows], merges: [], rowCount: rows.length + 1, colCount: header.length };
  const detected = detectHeaderRow(sheet.rows)!;
  const out = buildImportResult({ fileName: "mesas.xlsx", sheet, headerRowIndex: 0, mapping: detected.mapping, maxRows: 5000 });
  if (!out.ok) throw new Error(out.issues[0]?.code);
  return out.result;
}
const sample = () => excel(HEADER, [row("Tropical", "M1", "https://menu.example.com/1"), row("Tropical", "M2", "https://menu.example.com/2", "https://cdn.example.com/qr/2.svg"), row("Bar", "B1", ""), row("Tropical", "M1", "https://menu.example.com/1")]);

const xlsx = () => new File([new Uint8Array(200)], "mesas.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const reply = (result: ImportResult) => vi.fn(async () => Response.json({ ok: true, result }));

beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("pantalla de importación", () => {
  it("sube el archivo, muestra los totales y los errores con «Fila N: …»", async () => {
    const fetchMock = reply(sample());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(<ImportScreen />);

    await user.upload(await screen.findByTestId("excel-input"), xlsx());
    expect(await screen.findByTestId("stat-total")).toHaveProperty("textContent", "Filas encontradas: 4");
    expect(screen.getByTestId("stat-valid").textContent).toBe("Válidas: 2");
    expect(screen.getByTestId("stat-errors").textContent).toBe("Con errores: 1");
    expect(screen.getByTestId("stat-duplicates").textContent).toBe("Duplicadas: 1");
    expect(screen.getByText("Fila 4: Falta Link del menú")).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("/api/import/excel");
    expect(init.headers["X-File-Name"]).toBe("mesas.xlsx");
    expect(init.headers["Content-Type"]).toContain("spreadsheetml");
  });

  it("rechaza en el navegador un archivo que no es .xlsx, sin llamar al servidor", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup({ applyAccept: false });
    renderApp(<ImportScreen />);
    await user.upload(await screen.findByTestId("excel-input"), new File(["a,b"], "datos.csv", { type: "text/csv" }));
    expect((await screen.findByTestId("import-error")).textContent).toContain(".xlsx");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("muestra el motivo del rechazo del servidor y ofrece importar solo las primeras 5000", async () => {
    const issue = { row: null, field: "file", value: null, label: "Demasiadas filas", message: "El archivo tiene más filas de las permitidas. Hay más de 5000 filas con datos", severity: "error", code: "TOO_MANY_ROWS" };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: false, issues: [issue] }, { status: 422 })).mockResolvedValueOnce(Response.json({ ok: true, result: sample() }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(<ImportScreen />);
    await user.upload(await screen.findByTestId("excel-input"), xlsx());
    const alert = await screen.findByTestId("import-error");
    await user.click(within(alert).getByRole("button", { name: /Importar solo las primeras 5000/ }));
    await screen.findByTestId("stat-total");
    expect((fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string> }])[1].headers["X-Import-Truncate"]).toBe("5000");
  });

  it("confirmar con «Mantener» crea las piezas y va a la lista; el botón indica el recuento", async () => {
    vi.stubGlobal("fetch", reply(sample()));
    const user = userEvent.setup();
    const kv = memoryKv();
    renderApp(<ImportScreen />, { kv });
    await user.upload(await screen.findByTestId("excel-input"), xlsx());
    const confirm = await screen.findByTestId("confirm-import");
    expect(confirm.textContent).toBe("Importar 3 piezas");
    await user.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor"));
    expect(await screen.findByTestId("import-done")).toBeTruthy();
    await waitFor(() => expect(kv.data.has(LAST_IMPORT_KEY)).toBe(true));
  });

  it("«Eliminar duplicados» cambia el botón a «Importar 2 · descartar 1»", async () => {
    vi.stubGlobal("fetch", reply(sample()));
    const user = userEvent.setup();
    renderApp(<ImportScreen />);
    await user.upload(await screen.findByTestId("excel-input"), xlsx());
    await user.click(await screen.findByRole("radio", { name: "Eliminar duplicados" }));
    expect((await screen.findByTestId("confirm-import")).textContent).toBe("Importar 2 · descartar 1");
  });

  it("«Revisar manualmente» muestra un interruptor por copia", async () => {
    vi.stubGlobal("fetch", reply(sample()));
    const user = userEvent.setup();
    renderApp(<ImportScreen />);
    await user.upload(await screen.findByTestId("excel-input"), xlsx());
    await user.click(await screen.findByRole("radio", { name: "Revisar manualmente" }));
    await user.click(screen.getByRole("tab", { name: /Duplicados/ }));
    const toggle = await screen.findByRole("switch", { name: "Conservar la fila 5" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await user.click(toggle);
    expect((await screen.findByTestId("confirm-import")).textContent).toBe("Importar 3 piezas");
  });

  it("al recargar, el último resultado sigue ahí con sus filas con error", async () => {
    const kv = memoryKv({ [LAST_IMPORT_KEY]: { result: sample(), outcome: null } });
    renderApp(<ImportScreen />, { kv });
    expect(await screen.findByTestId("stat-errors")).toBeTruthy();
    expect(screen.getByText("Fila 4: Falta Link del menú")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descargar informe de errores/ })).toBeTruthy();
  });

  it("sin la columna Mesa abre el diálogo de columnas y, al aplicarlo, reenvía con X-Column-Mapping", async () => {
    const missing = excel(["Área", "Número", "Concepto", "Link del menú"].map(s), [[s("Bar"), s("5"), s("x"), s("https://menu.example.com/b")]]);
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, result: missing })).mockResolvedValueOnce(Response.json({ ok: true, result: sample() }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp(<ImportScreen />);
    await user.upload(await screen.findByTestId("excel-input"), xlsx());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert").textContent).toContain("Mesa");
    expect((within(dialog).getByRole("button", { name: "Aplicar y revisar" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole("combobox", { name: /Columna B/ }));
    await user.click(await screen.findByRole("option", { name: /^Mesa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Aplicar y revisar" }));

    await screen.findByTestId("stat-total");
    const header = (fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string> }])[1].headers["X-Column-Mapping"] as string;
    const decoded = JSON.parse(atob(header.replaceAll("-", "+").replaceAll("_", "/"))) as { columns: Record<string, string | null> };
    expect(decoded.columns).toMatchObject({ A: "area", B: "mesa", C: "concepto", D: "menuUrl" });
  });

  it("en solo lectura no se puede confirmar", async () => {
    vi.stubGlobal("fetch", reply(sample()));
    renderApp(<ImportScreen />, { locks: heldLocks });
    expect(await screen.findByText(/solo lectura/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Seleccionar archivo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
