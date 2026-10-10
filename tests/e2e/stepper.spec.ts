import { writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { addRecord, createEmptyProject, setProjectName } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

const NOW = "2026-10-08T10:00:00.000Z";

async function openProject(page: Page, file: string, count = 3) {
  let project = setProjectName(createEmptyProject(NOW, { id: "st" }), "Flujo en cuatro pasos");
  for (let i = 1; i <= count; i++) project = addRecord(project, { area: "Playa", estacion: "", mesa: `B${i}`, subgrupo: "", concepto: "", menuUrl: `https://menu.example.com/lblc/${i}` }, NOW, { id: `r${i}` }).state;
  await writeFile(file, serializeProjectFile(project, NOW));
  await page.goto("/");
  await page.getByTestId("open-project-input").setInputFiles(file);
  await expect(page.getByText(/piezas? abiertas?/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); // autoguardado antes de cambiar de página
}

test.describe("flujo en cuatro pasos: Piezas → Estilo del QR → Diseño → Exportar", () => {
  test("el Inicio solo retoma o empieza; y cada paso lleva al siguiente con su pie de página", async ({ page, isMobile }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByTestId("wizard-steps")).toHaveCount(0); // el Inicio no es un paso
    await openProject(page, info.outputPath("s.qrproj.json"));
    await page.reload();
    await expect(page.getByTestId("continue-card")).toContainText("Flujo en cuatro pasos");
    await page.getByRole("link", { name: "Continuar" }).click();

    // Paso 1
    await page.waitForURL("**/editor");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tus piezas");
    await expect(page.getByText("Paso 1 de 4", { exact: true })).toBeVisible();
    if (!isMobile) await expect(page.getByRole("link", { name: /Piezas/ }).first()).toHaveAttribute("aria-current", "step");
    await page.getByTestId("step-next").click();

    // Paso 2
    await page.waitForURL("**/style");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dale estilo al QR");
    await expect(page.getByText("Paso 2 de 4", { exact: true })).toBeVisible();
    await expect(page.getByTestId("qr-style-preview")).toBeVisible();
    await page.getByTestId("step-next").click();

    // Paso 3
    await page.waitForURL("**/preview");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diseña la pieza");
    await expect(page.getByTestId("layout-editor")).toBeVisible();
    await expect(page.getByTestId("packing-result")).toHaveCount(0); // las opciones del PDF no están aquí
    await page.getByTestId("step-next").click();

    // Paso 4
    await page.waitForURL("**/export");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Exporta el PDF");
    await expect(page.getByTestId("packing-result")).toHaveText("6 por página · 1 página");
    await expect(page.getByTestId("download-pdf")).toBeEnabled();
    await expect(page.getByTestId("step-next")).toHaveCount(0); // el último paso termina en la descarga
    await page.getByRole("link", { name: "Diseño" }).last().click();
    await page.waitForURL("**/preview");
  });

  test("sin piezas, los pasos 2 a 4 no se pueden alcanzar", async ({ page, isMobile }) => {
    await page.goto("/editor");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tus piezas");
    await expect(page.getByTestId("step-footer").getByRole("button", { name: "Siguiente: Estilo del QR" })).toBeDisabled();
    if (!isMobile) {
      await expect(page.getByTestId("wizard-steps").getByRole("link", { name: /Diseño/ })).toHaveCount(0);
      await expect(page.getByTestId("wizard-steps").locator('[aria-disabled="true"]')).toHaveCount(3);
    }
    await page.goto("/export");
    await expect(page.getByRole("heading", { name: "Aún no hay piezas que exportar" })).toBeVisible();
  });

  test("en el móvil el Stepper se resume en «Paso N de 4» y ninguna pantalla se desborda en horizontal", async ({ page, isMobile }, info) => {
    test.skip(!isMobile, "solo móvil");
    await openProject(page, info.outputPath("m.qrproj.json"));
    for (const [path, step] of [["/editor", 1], ["/import", 1], ["/style", 2], ["/preview", 3], ["/export", 4]] as const) {
      await page.goto(path);
      await expect(page.getByText(`Paso ${step} de 4`).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("importar sigue siendo parte del paso 1 y vuelve a las piezas", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Importa desde Excel o CSV");
    await page.getByRole("link", { name: "← Volver a las piezas" }).click();
    await page.waitForURL("**/editor");
  });
});
