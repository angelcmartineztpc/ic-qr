import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

/** Acortador de links del menú de punta a punta con el servidor real (storage local y redirect público). */
/**
 * Cada prueba usa links propios (con una marca única): el almacenamiento del servidor de pruebas se comparte entre
 * pruebas y entre escritorio y móvil, y un link ya acortado (o con el destino cambiado) se reutiliza a propósito.
 */
function dataset(tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`) {
  const long = (n: number) => `https://menu.palaceresorts.com/restaurant/leblanc-los-cabos/carta?id=${n}&t=${tag}&utm_source=qr&utm_medium=mesa&token=${"x".repeat(160)}`;
  const csv = ["Área,Estación,Mesa,Sub-grupo,Concepto,Link del menú,Link del QR", `Playa,,B1,,Alimentos,${long(1)},`, `Playa,,B2,,Alimentos,${long(2)},`, `Piscina,,P1,,Bebidas,${long(1)},`].join("\n");
  return { long, csv };
}
const SHORT = /\/s\/[2-9a-hjkmnp-z]{8}$/;

const uploadCsv = async (page: Page, csv: string) => {
  await expect(page.getByRole("button", { name: "Seleccionar archivo" })).toBeEnabled();
  await page.getByTestId("excel-input").setInputFiles({ name: "mesas.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
};

/** Abre /import con el selector de archivo listo (si quedó un resultado anterior, lo cierra). */
async function openImport(page: Page) {
  await page.goto("/import");
  const next = page.getByRole("button", { name: /Seleccionar archivo|Cerrar este resultado/ });
  await expect(next).toBeVisible();
  if ((await next.textContent())?.includes("Cerrar")) await next.click();
}

async function importCsv(page: Page, csv: string, mode: "append" | "replace" = "append") {
  await openImport(page);
  await uploadCsv(page, csv);
  await expect(page.getByTestId("stat-valid")).toHaveText("Válidas: 3");
  if (mode === "replace") await page.getByLabel("Reemplazar el proyecto").check();
  await page.getByTestId("confirm-import").click();
  // Reemplazar con cambios sin descargar pide confirmación (según el momento del autoguardado, puede no aparecer).
  if (mode === "replace") await page.getByRole("button", { name: "Reemplazar sin guardar" }).click({ timeout: 3_000 }).catch(() => undefined);
  await page.waitForURL("**/editor");
}

/** Link del menú que muestra la pieza actual. */
const shownShortUrl = async (page: Page) => {
  const link = page.getByRole("link", { name: SHORT });
  await expect(link.first()).toBeVisible({ timeout: 30_000 });
  return (await link.first().textContent()) ?? "";
};

test.describe("acortador de links del menú", () => {
  test("importar acorta cada link distinto una sola vez, el redirect es público y el destino se puede cambiar sin tocar el QR", async ({ page, request }) => {
    const { long, csv } = dataset();
    await openImport(page);
    await uploadCsv(page, csv);
    await expect(page.getByTestId("shorten-note")).toContainText("los 2 links del menú distintos se acortarán");
    await page.getByTestId("confirm-import").click();
    await page.waitForURL("**/editor");
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 3");

    const shortUrl = await shownShortUrl(page);
    expect(shortUrl.length).toBeLessThan(long(1).length / 4);
    await expect(page.getByTestId("link-destination")).toContainText(long(1), { timeout: 30_000 });

    // Es público: sin sesión, sin redirecciones automáticas.
    const first = await request.get(shortUrl, { maxRedirects: 0 });
    expect(first.status()).toBe(302);
    expect(first.headers()["location"]).toBe(long(1));
    expect(first.headers()["cache-control"]).toBe("no-store");
    expect((await request.get(shortUrl.replace(/[2-9a-z]{8}$/, "zzzzzzzz"), { maxRedirects: 0 })).status()).toBe(404);

    // Cambiar el destino: el mismo link corto lleva al nuevo.
    await page.getByRole("button", { name: "Cambiar destino" }).click();
    await page.getByLabel("Destino nuevo").fill("https://menu.example.com/carta-nueva");
    await page.getByRole("button", { name: "Guardar destino" }).click();
    await expect(page.getByTestId("link-destination")).toContainText("https://menu.example.com/carta-nueva");
    await expect(page.getByText(/Se ha cambiado 1 vez; el QR sigue siendo el mismo/)).toBeVisible();
    const second = await request.get(shortUrl, { maxRedirects: 0 });
    expect(second.headers()["location"]).toBe("https://menu.example.com/carta-nueva");
    await expect(page.getByRole("link", { name: SHORT }).first()).toHaveText(shortUrl); // el link (y el QR) no cambió
  });

  test("volver a importar el mismo Excel da exactamente los mismos links cortos", async ({ page }) => {
    const { csv } = dataset();
    await importCsv(page, csv);
    const before = await shownShortUrl(page);
    await importCsv(page, csv, "replace");
    expect(await shownShortUrl(page)).toBe(before);
  });

  test("«Descargar Excel actualizado» trae el link corto en «Link del menú» y el destino de referencia", async ({ page }, info) => {
    const { long, csv } = dataset();
    await importCsv(page, csv);
    const short = await shownShortUrl(page);
    await page.getByRole("button", { name: "Más opciones del proyecto" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Descargar Excel actualizado" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    const path = info.outputPath("actualizado.xlsx");
    await file.saveAs(path);
    const book = XLSX.read(await readFile(path), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets["Piezas"] as XLSX.WorkSheet, { header: 1, defval: "" });
    expect(rows[0]).toEqual(["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR", "Link original (referencia)"]);
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(1)) expect(row[5]).toMatch(SHORT);
    expect(rows.map((r) => r[5])).toContain(short);
    expect(rows[1]?.[7]).toBe(long(1));

    // Ese archivo se puede volver a importar: las filas que ya traen link corto se conservan tal cual.
    await openImport(page);
    await uploadCsv(page, rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n"));
    await expect(page.getByTestId("shorten-note")).toHaveCount(0); // nada nuevo que acortar
  });

  test("en el formulario de Piezas, el campo «Link del menú» se acorta al salir de él y la pieza se guarda con el link corto", async ({ page, request }) => {
    const { long } = dataset();
    await page.goto("/editor");
    await page.getByRole("button", { name: "+ Agregar nuevo" }).first().click();
    await page.getByLabel(/^Área/).fill("Playa");
    await page.getByLabel(/^Mesa/).fill("B9");
    const field = page.getByLabel(/^Link del menú/);
    await field.fill(long(9));
    await field.press("Tab");
    await expect(field).toHaveValue(SHORT, { timeout: 30_000 });
    await expect(page.getByText(/Link acortado: el QR lleva este link corto/)).toBeVisible();
    const shortUrl = await field.inputValue();
    await page.getByRole("button", { name: "Agregar pieza" }).click();
    await expect(page.getByRole("link", { name: shortUrl }).first()).toBeVisible({ timeout: 30_000 });
    expect((await request.get(shortUrl, { maxRedirects: 0 })).headers()["location"]).toBe(long(9));
  });

  test("un link inválido no se acorta y la pieza queda marcada para corregir", async ({ page }) => {
    const { long } = dataset();
    await openImport(page);
    await uploadCsv(page, ["Área,Mesa,Link del menú", `Playa,B1,${long(7)}`, "Playa,B2,esto no es un link"].join("\n"));
    await expect(page.getByTestId("stat-valid")).toHaveText("Válidas: 1");
    await expect(page.getByTestId("stat-errors")).toHaveText("Con errores: 1");
    await page.getByTestId("confirm-import").click();
    await page.waitForURL("**/editor");
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 1");
    await shownShortUrl(page);
  });
});
