import { writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { addRecord, createEmptyProject, setProjectName } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

const NOW = "2026-10-10T10:00:00.000Z";
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4L96 50L50 96L4 50Z" fill="#274C69"/><path d="M50 28L72 50L50 72L28 50Z" fill="#FFFFFF"/></svg>`;

async function openProject(page: Page, file: string) {
  let project = setProjectName(createEmptyProject(NOW, { id: "qs" }), "Estilo del QR");
  project = addRecord(project, { area: "Playa", estacion: "", mesa: "B1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/lblc/1" }, NOW, { id: "r1" }).state;
  project = addRecord(project, { area: "Playa", estacion: "", mesa: "B2", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/lblc/2", qrUrl: "https://assets.example.com/qr/b2.svg" }, NOW, { id: "r2" }).state;
  await writeFile(file, serializeProjectFile(project, NOW));
  await page.goto("/");
  await page.getByTestId("open-project-input").setInputFiles(file);
  await expect(page.getByText(/piezas? abiertas?/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); // autoguardado antes de cambiar de página
  await page.goto("/style");
  await expect(page.getByTestId("qr-style-preview")).toBeVisible({ timeout: 20_000 });
}

test.describe("paso «Estilo del QR»", () => {
  test("cambiar forma y colores actualiza al instante la vista previa y se conserva al recargar", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs.qrproj.json"));
    const preview = page.getByTestId("qr-style-preview");
    const before = await preview.getAttribute("src");

    await page.getByRole("radio", { name: "Puntos" }).click();
    await expect(page.getByRole("radio", { name: "Puntos" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => preview.getAttribute("src")).not.toBe(before);

    await page.getByLabel("Módulos", { exact: true }).fill("#274c69"); // selector de color del navegador
    await expect(page.getByLabel("Módulos (hexadecimal)")).toHaveValue("#274C69");
    await page.waitForTimeout(1200); // autoguardado
    await page.reload();
    await expect(page.getByRole("radio", { name: "Puntos" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Módulos (hexadecimal)")).toHaveValue("#274C69");
  });

  test("un logo SVG se sube, se pinta en el QR y se puede quitar", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs-logo.qrproj.json"));
    const logo = info.outputPath("logo.svg");
    await writeFile(logo, LOGO);
    const before = await page.getByTestId("qr-style-preview").getAttribute("src");
    await page.getByTestId("logo-input").setInputFiles(logo);
    await expect(page.getByTestId("logo-name")).toHaveText("logo.svg");
    await expect.poll(async () => decodeURIComponent((await page.getByTestId("qr-style-preview").getAttribute("src")) ?? "")).toContain('id="qr-logo"');
    expect(await page.getByTestId("qr-style-preview").getAttribute("src")).not.toBe(before);
    await page.getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByTestId("logo-name")).toHaveCount(0);
  });

  test("un archivo que no es un SVG seguro se rechaza con un mensaje claro", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs-bad.qrproj.json"));
    const bad = info.outputPath("bad.svg");
    await writeFile(bad, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`);
    await page.getByTestId("logo-input").setInputFiles(bad);
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo usar el SVG" })).toBeVisible();
    await expect(page.getByTestId("logo-name")).toHaveCount(0);
  });

  test("un estilo con contraste casi nulo avisa aquí y bloquea la descarga en Exportar", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs-contrast.qrproj.json"));
    await page.getByLabel("Módulos (hexadecimal)").fill("#EEEEEE");
    await expect(page.getByTestId("qr-style-warning").first()).toContainText("casi no se distingue");
    await page.waitForTimeout(1200);
    await page.goto("/export");
    await expect(page.getByTestId("style-blocker")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("download-pdf")).toBeDisabled();
    await page.getByRole("link", { name: "Corregir estilo" }).click();
    await page.waitForURL("**/style");
  });

  test("las piezas con Link del QR avisan de que conservan su QR", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs-ext.qrproj.json"));
    await expect(page.getByTestId("existing-note")).toContainText("1 pieza trae su propio QR");
  });

  test("restablecer vuelve al QR clásico", async ({ page }, info) => {
    await openProject(page, info.outputPath("qs-reset.qrproj.json"));
    await page.getByRole("radio", { name: "Puntos" }).click();
    await page.getByRole("button", { name: "Restablecer al QR clásico" }).click();
    await expect(page.getByRole("radio", { name: "Puntos" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("button", { name: "Restablecer al QR clásico" })).toBeDisabled();
  });
});
