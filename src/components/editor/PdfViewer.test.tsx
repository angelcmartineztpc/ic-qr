import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PDF_DEFAULTS } from "@/schemas/pdf";
import type { PDFOptions } from "@/types";

import { pendingRecord } from "../../../tests/helpers/records";
import { renderApp } from "../../../tests/helpers/render-app";
import { PdfViewer } from "./PdfViewer";

const tile = { width: 70, height: 70 };
const options = (over: Partial<PDFOptions> = {}): PDFOptions => ({ ...PDF_DEFAULTS, pageSize: { ...PDF_DEFAULTS.pageSize }, margins: { ...PDF_DEFAULTS.margins }, ...over }) as PDFOptions;
const records = (n: number) => Array.from({ length: n }, (_, i) => pendingRecord({ mesa: `M${i + 1}` }, `r${i + 1}`));

describe("visor del PDF", () => {
  it("es un visor: barra de controles, contador de hojas y resumen de lo que se exporta", () => {
    renderApp(<PdfViewer tile={tile} options={options()} records={records(8)} />);
    expect(screen.getByRole("region", { name: "Visor del PDF" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Controles del visor" })).toBeTruthy();
    expect(screen.getByTestId("pdf-page-count").textContent).toBe("/ 2"); // 6 por hoja → 8 piezas = 2 hojas
    expect((screen.getByTestId("pdf-page-input") as HTMLInputElement).value).toBe("1");
    expect(screen.getByText(/8 piezas · 6 por hoja · 210 × 297 mm/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Página anterior" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Página siguiente" })).toHaveProperty("disabled", false);
  });

  it("el zoom parte de «Ajustar al ancho» y ofrece ajustar a la página y porcentajes", async () => {
    const user = userEvent.setup();
    renderApp(<PdfViewer tile={tile} options={options()} records={records(2)} />);
    await user.click(screen.getByRole("combobox", { name: "Zoom" }));
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(labels).toEqual(["Ajustar al ancho", "Ajustar a la página", "25 %", "50 %", "75 %", "100 %", "125 %", "150 %", "200 %", "300 %"]);
    await user.click(screen.getByRole("option", { name: "150 %" }));
    expect(screen.getByRole("combobox", { name: "Zoom" }).textContent).toBe("150 %");
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(screen.getByRole("combobox", { name: "Zoom" }).textContent).toBe("125 %");
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    expect(screen.getByRole("combobox", { name: "Zoom" }).textContent).toBe("200 %");
  });

  it("las miniaturas se pueden ocultar y mostrar", async () => {
    const user = userEvent.setup();
    renderApp(<PdfViewer tile={tile} options={options()} records={records(2)} />);
    expect(screen.getByTestId("pdf-thumbnails")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Miniaturas" }));
    expect(screen.queryByTestId("pdf-thumbnails")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Miniaturas" }));
    expect(screen.getByTestId("pdf-thumbnails")).toBeTruthy();
  });

  it("con «una pieza por página» hay una hoja por pieza y con una hoja el contador es 1", () => {
    const { unmount } = renderApp(<PdfViewer tile={tile} options={options({ mode: "single" })} records={records(3)} />);
    expect(screen.getByTestId("pdf-page-count").textContent).toBe("/ 3");
    unmount();
    render(<p />);
    renderApp(<PdfViewer tile={tile} options={options()} records={records(1)} />);
    expect(screen.getByTestId("pdf-page-count").textContent).toBe("/ 1");
  });

  it("si la pieza no cabe en la hoja no hay visor, solo un aviso", () => {
    renderApp(<PdfViewer tile={tile} options={options({ pageSize: { kind: "custom", widthMm: 60, heightMm: 60 } })} records={records(2)} />);
    expect(screen.getByText("No hay hojas que mostrar.")).toBeTruthy();
  });
});
