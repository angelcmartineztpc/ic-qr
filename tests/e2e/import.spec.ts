import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { buildXlsx, buildZip, HEADER, menuRow, minimalWorkbookEntries, SHEET_XML, type Cell } from "../helpers/xlsx-fixtures";

/** Importación de Excel de punta a punta con el servidor real (worker de SheetJS incluido). Corre en escritorio y en móvil (selector de archivo). */
function mesas(valid: number, invalid = 5): Buffer {
  const rows: Cell[][] = [];
  for (let i = 1; i <= valid; i++) rows.push(menuRow("Tropical", i, { menu: `https://menu.example.com/tropical/${i}` }));
  const bad: Cell[][] = [
    menuRow("Bar", "B1", { menu: "" }),
    ["Bar", "", "", "", "", "https://menu.example.com/bar/2", ""],
    menuRow("Bar", "B3", { menu: "esto no es un link" }),
    menuRow("", "B4"),
    menuRow("Bar", "B5", { qr: "ftp://x" }),
  ].slice(0, invalid);
  return Buffer.from(buildXlsx([{ name: "Mesas", rows: [HEADER, ...rows, ...bad] }]));
}

const upload = (page: Page, name: string, buffer: Buffer) =>
  page.getByTestId("excel-input").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

test.describe("Importar Excel (AC5–AC11, spec §4B)", () => {
  test("100 filas válidas + 5 con error: 100 piezas, 5 listadas, descargables y recuperables tras recargar", async ({ page }) => {
    await page.goto("/import");
    await upload(page, "Mesas – 2026.xlsx", mesas(100));

    await expect(page.getByTestId("stat-total")).toHaveText("Filas encontradas: 105");
    await expect(page.getByTestId("stat-valid")).toHaveText("Válidas: 100");
    await expect(page.getByTestId("stat-errors")).toHaveText("Con errores: 5");
    for (const line of ["Fila 102: Falta Link del menú", "Fila 103: Mesa vacía", "Fila 104: Link del menú inválido", "Fila 105: Área vacía", "Fila 106: Link del QR inválido"]) {
      await expect(page.getByText(line)).toBeVisible();
    }

    await page.getByTestId("confirm-import").click();
    await page.waitForURL("**/editor");
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 100");
    // Cada pieza sin Link del QR se genera una sola vez, en lote, con el servidor real.
    await expect(page.getByTestId("counter-withQr")).toHaveText("Con QR: 100", { timeout: 90_000 });

    // Recargar no pierde las filas con error.
    await page.goto("/import");
    await expect(page.getByTestId("stat-errors")).toHaveText("Con errores: 5");
    await expect(page.getByText("Fila 103: Mesa vacía")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar informe de errores/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("errores-Mesas – 2026.csv");
    const csv = await readFile(await file.path(), "utf8");
    expect(csv.startsWith("﻿Fila,Campo,Problema")).toBe(true);
    expect(csv).toContain("102,Link del menú,Falta Link del menú");
  });

  test("un archivo hostil se rechaza con un mensaje claro y la app sigue funcionando", async ({ page, request }) => {
    await page.goto("/import");
    const bomb = Buffer.from(buildZip([...minimalWorkbookEntries(SHEET_XML([["a"]])).slice(0, 3), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(15 * 1024 * 1024) }]));
    await upload(page, "bomba.xlsx", bomb);
    await expect(page.getByTestId("import-error")).toContainText("se descomprime a un tamaño desproporcionado");
    expect((await request.get("/api/health")).ok()).toBe(true);

    // Y se puede intentar con un archivo bueno a continuación.
    await upload(page, "bien.xlsx", mesas(3, 0));
    await expect(page.getByTestId("stat-valid")).toHaveText("Válidas: 3");
  });

  test("un CSV renombrado a .xlsx lo rechaza el servidor; un .csv ni siquiera sale del navegador", async ({ page }) => {
    await page.goto("/import");
    await upload(page, "datos.xlsx", Buffer.from("Área,Mesa,Link\nBar,1,https://x.com\n".repeat(30)));
    await expect(page.getByTestId("import-error")).toContainText("no es un libro de Excel");
    await page.getByTestId("excel-input").setInputFiles({ name: "datos.csv", mimeType: "text/csv", buffer: Buffer.from("a,b") });
    await expect(page.getByTestId("import-error")).toContainText("Solo se admiten archivos .xlsx");
  });

  test("duplicados: «Eliminar duplicados» importa la primera y deja la copia en el informe", async ({ page }) => {
    const rows: Cell[][] = [menuRow("Tropical", 1), menuRow("Bar", 2), menuRow("Tropical", 1)];
    await page.goto("/import");
    await upload(page, "dup.xlsx", Buffer.from(buildXlsx([{ name: "Mesas", rows: [HEADER, ...rows] }])));
    await expect(page.getByTestId("stat-duplicates")).toHaveText("Duplicadas: 1");
    await page.getByRole("radio", { name: "Eliminar duplicados" }).check();
    await expect(page.getByTestId("confirm-import")).toHaveText("Importar 2 · descartar 1");
    await page.getByTestId("confirm-import").click();
    await page.waitForURL("**/editor");
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 2");
  });

  test("un libro sin la columna Mesa pide elegirla y luego importa", async ({ page }) => {
    const file = Buffer.from(buildXlsx([{ name: "Mesas", rows: [["Zona", "Número", "Concepto", "Link del menú"], ["Bar", 5, "Terraza", "https://menu.example.com/bar"]] }]));
    await page.goto("/import");
    await upload(page, "sin-mesa.xlsx", file);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /Columna B/ }).click();
    await page.getByRole("option", { name: /^Mesa/ }).click();
    await dialog.getByRole("button", { name: "Aplicar y revisar" }).click();
    await expect(page.getByTestId("stat-valid")).toHaveText("Válidas: 1");
  });
});
