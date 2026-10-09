import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { addRecord, createEmptyProject, setProjectName } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

const MENU = "https://menu.example.com/tropical";

async function addPiece(page: Page, mesa: string, menuUrl = `${MENU}?mesa=${encodeURIComponent(mesa)}`) {
  await page.getByRole("button", { name: "+ Agregar nuevo" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^Área/ }).fill("Tropical");
  await dialog.getByRole("textbox", { name: /^Mesa/ }).fill(mesa);
  await dialog.getByRole("textbox", { name: /^Link del menú/ }).fill(menuUrl);
  await dialog.getByRole("button", { name: "Agregar pieza" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("Descargar SVG de esta pieza (spec §17, AC20, AC26)", () => {
  test("el SVG es de 70 × 70 mm (la referencia), vectorial, con el texto en contornos y el QR como un solo trazado", async ({ page }) => {
    await page.goto("/editor");
    await addPiece(page, "M1");
    await expect(page.getByTestId("qr-status").first()).toContainText("✓ QR generado", { timeout: 15_000 });

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar SVG" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("M1-Tropical.svg");

    const svg = await readFile(await file.path(), "utf8");
    expect(svg).toMatch(/^<svg [^>]*width="70mm" height="70mm" viewBox="0 0 700 700"/);
    expect(svg).toContain('id="qr-code"');
    expect(svg.match(/<path id="qr-code"/g)).toHaveLength(1); // un solo trazado compuesto
    expect(svg).toContain('id="text-area"'); // el texto está, pero…
    expect(svg).not.toMatch(/<text|<image|<style|<script|font-face|href=/); // …en contornos: sin fuentes, imágenes ni scripts
    // Los avisos se muestran de uno en uno (§S7): este llega tras «Pieza agregada» y «1 QR generado».
    // Con la referencia (QR de 24.79 mm sin zona de silencio propia) este link da módulos de ~0.67 mm: sin avisos.
    await expect(page.getByText("SVG descargado: M1-Tropical.svg", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("con el QR pendiente no se descarga: se avisa", async ({ page }) => {
    await page.route("**/api/qr/resolve", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], created: 0, reused: 0, failed: 0 }) }));
    await page.goto("/editor");
    await addPiece(page, "M1");
    await expect(page.getByTestId("qr-status").first()).toContainText("QR pendiente");
    await page.getByRole("button", { name: "Descargar SVG" }).click();
    await expect(page.getByText(/Resuelve el QR y los errores de M1 · Tropical antes de descargar su SVG/)).toBeVisible();
  });
});

test.describe("dos pestañas: un solo escritor (AC: la segunda queda en solo lectura)", () => {
  test.skip(({ isMobile }) => isMobile, "no depende del tamaño de pantalla");

  test("la segunda queda en solo lectura; al tomar el control ve lo último guardado y no pisa nada", async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    const b = await context.newPage();
    try {
      await a.goto("/editor");
      await expect(a.getByRole("heading", { name: "Aún no hay piezas" })).toBeVisible();
      await b.goto("/editor");
      await expect(b.getByText(/abierto en otra pestaña y aquí solo puedes verlo/)).toBeVisible();
      await expect(b.getByRole("button", { name: "+ Agregar nuevo" }).first()).toBeDisabled();

      // A trabaja y guarda mientras B (con el proyecto vacío cargado) sigue abierta.
      await addPiece(a, "M1");
      await expect(a.getByTestId("qr-status").first()).toContainText("✓ QR generado", { timeout: 15_000 });
      await expect(a.getByText("Guardado en este navegador")).toBeVisible();
      await expect(b.getByRole("heading", { name: "Aún no hay piezas" })).toBeVisible(); // B aún ve lo viejo

      // B toma el control: ANTES de poder editar recarga lo guardado por A.
      await b.getByRole("button", { name: "Tomar el control" }).click();
      await expect(b.getByTestId("counter-all")).toHaveText("Total: 1", { timeout: 10_000 });
      await expect(b.getByRole("button", { name: "+ Agregar nuevo" }).first()).toBeEnabled();
      await expect(a.getByText(/abierto en otra pestaña y aquí solo puedes verlo/)).toBeVisible();
      await expect(a.getByRole("button", { name: "+ Agregar nuevo" }).first()).toBeDisabled();

      // Lo que escribe B se suma al trabajo de A (no lo sustituye).
      await addPiece(b, "M2");
      await expect(b.getByText("Guardado en este navegador")).toBeVisible();
      await b.reload();
      await expect(b.getByText(/Proyecto restaurado: 2 piezas/)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("rendimiento con 1000 piezas (AC: cambiar de página <100 ms, sin tareas largas >200 ms)", () => {
  test.skip(({ isMobile }) => isMobile, "la medida de rendimiento se hace en escritorio");

  test("navegar por la rejilla con 1000 piezas es fluido", async ({ page }, info) => {
    let project = createEmptyProject("2026-10-06T10:00:00.000Z", { id: "perf" });
    project = setProjectName(project, "Proyecto 1000");
    for (let i = 1; i <= 1000; i++) project = addRecord(project, { area: `Área ${(i % 7) + 1}`, estacion: "", mesa: `M${i}`, subgrupo: "", concepto: "", menuUrl: `${MENU}?m=${i}` }, "2026-10-06T10:00:00.000Z", { id: `r${i}` }).state;
    const file = info.outputPath("proyecto-1000.qrproj.json");
    await writeFile(file, serializeProjectFile(project, "2026-10-06T10:00:00.000Z"));

    await page.goto("/");
    await page.getByTestId("open-project-input").setInputFiles(file);
    await expect(page.getByText(/1000 piezas abiertas/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Continuar" }).click();
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 1000");
    await page.getByRole("button", { name: /^Todas/ }).click();
    await expect(page.getByTestId("page-position")).toHaveText("Página 1 de 42");
    await expect(page.getByTestId("record-card")).toHaveCount(24); // solo la página visible, no las 1000

    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ["longtask"] });
    });

    const timings: number[] = [];
    for (let step = 0; step < 6; step++) {
      timings.push(
        await page.evaluate(async () => {
          const first = () => document.querySelector('[data-testid="record-card"]')?.getAttribute("data-record-id");
          const before = first();
          const start = performance.now();
          (document.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement).click();
          while (first() === before) await new Promise((resolve) => requestAnimationFrame(resolve));
          return performance.now() - start;
        }),
      );
      await page.waitForTimeout(150);
    }
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    console.log(`PERF cambio de página (ms): ${timings.map((t) => t.toFixed(0)).join(", ")} · tareas largas: ${long.map((d) => d.toFixed(0)).join(", ") || "ninguna"}`);

    expect(Math.max(...timings)).toBeLessThan(100);
    expect(long.filter((duration) => duration > 200)).toEqual([]);
    await expect(page.getByTestId("page-position")).toHaveText("Página 7 de 42");
  });
});
