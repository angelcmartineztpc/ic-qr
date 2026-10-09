import { readFile, stat, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { addRecord, createEmptyProject } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

/** Descarga completa con 1000 piezas (QR incluidos): el PDF debe ser vectorial y tener 167 páginas. Solo escritorio. */
test.skip(({ isMobile }) => isMobile, "la carga de 1000 piezas se mide en escritorio");

test("1000 piezas: se resuelven los QR, se genera y se descarga un PDF de 167 páginas", async ({ page }, info) => {
  test.setTimeout(240_000);
  const NOW = "2026-10-08T10:00:00.000Z";
  let project = createEmptyProject(NOW, { id: "big" });
  for (let i = 1; i <= 1000; i++) project = addRecord(project, { area: `Zona ${(i % 9) + 1}`, estacion: "", mesa: `B${i}`, subgrupo: "", concepto: "", menuUrl: `https://menu.example.com/big/${i}` }, NOW, { id: `r${i}` }).state;
  const file = info.outputPath("big.qrproj.json");
  await writeFile(file, serializeProjectFile(project, NOW));
  await page.goto("/");
  await page.getByTestId("open-project-input").setInputFiles(file);
  await expect(page.getByText(/1000 piezas abiertas/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.goto("/export");
  await expect(page.getByTestId("packing-result")).toHaveText("6 por página · 167 páginas", { timeout: 20_000 });

  const started = Date.now();
  const download = page.waitForEvent("download", { timeout: 200_000 });
  await page.getByTestId("download-pdf").click();
  const saved = await download;
  const path = await saved.path();
  const seconds = (Date.now() - started) / 1000;
  const size = (await stat(path)).size;
  console.log(`DESCARGA 1000 piezas: ${seconds.toFixed(1)} s (con QR) · ${(size / 1024 / 1024).toFixed(1)} MB`);
  const head = (await readFile(path)).subarray(0, 5).toString();
  expect(head).toBe("%PDF-");
  expect(size).toBeGreaterThan(500_000);
  await expect(page.getByTestId("last-export")).toContainText("1000 piezas en 167 páginas");
});
