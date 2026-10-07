import { writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { addRecord, createEmptyProject, setProjectName } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

const NOW = "2026-10-07T10:00:00.000Z";
const MENU = "https://menu.example.com/tropical";

async function openProject(page: Page, count: number, file: string) {
  let project = setProjectName(createEmptyProject(NOW, { id: "pv" }), "Editor");
  for (let i = 1; i <= count; i++) project = addRecord(project, { area: `Área ${(i % 5) + 1}`, estacion: "", mesa: `M${i}`, subgrupo: "", concepto: "", menuUrl: `${MENU}?m=${i}` }, NOW, { id: `r${i}` }).state;
  await writeFile(file, serializeProjectFile(project, NOW));
  await page.goto("/");
  await page.getByTestId("open-project-input").setInputFiles(file);
  await expect(page.getByText(new RegExp(`${count} piezas? abiertas?`))).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); // el autoguardado (200 ms) debe terminar antes de recargar la página
  await page.goto("/preview");
  await expect(page.getByTestId("layout-editor")).toBeVisible({ timeout: 20_000 });
}

const label = (page: Page, key: "qr" | "content") => page.getByTestId(`box-${key}`).getAttribute("aria-label");
const rectOf = (page: Page, key: "qr" | "content") => page.getByTestId(`box-${key}`).locator("rect").first();

/** Caja en pantalla: el ratón de Playwright solo llega a lo que está dentro del viewport. */
async function onScreen(page: Page, key: "qr" | "content") {
  await rectOf(page, key).scrollIntoViewIfNeeded();
  const box = await rectOf(page, key).boundingBox();
  if (!box) throw new Error("sin caja");
  return box;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, options: { release?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  if (options.release !== false) await page.mouse.up();
}

test.describe("editor visual: arrastre real (AC19, AC21–AC24)", () => {
  test.skip(({ isMobile }) => isMobile, "el arrastre fino se prueba en escritorio; en móvil hay campos de coordenadas");

  test("arrastrar el QR lo mueve en mm, es UN paso de deshacer y sobrevive a recargar", async ({ page }, info) => {
    await openProject(page, 3, info.outputPath("p3.qrproj.json"));
    const before = await label(page, "qr");
    const box = await onScreen(page, "qr");
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 - 60, y: box.y + box.height / 2 - 30 });
    await expect(page.getByTestId("box-qr")).not.toHaveAttribute("aria-label", before ?? "");
    const after = await label(page, "qr");
    expect(after).toMatch(/^QR: x \d/);

    await page.getByRole("button", { name: "Deshacer" }).click();
    expect(await label(page, "qr")).toBe(before);
    await page.getByRole("button", { name: "Rehacer" }).click();
    expect(await label(page, "qr")).toBe(after);

    await page.waitForTimeout(500); // autoguardado
    await page.reload();
    await expect(page.getByTestId("layout-editor")).toBeVisible();
    expect(await label(page, "qr")).toBe(after);
  });

  test("Esc cancela el arrastre y no deja nada que deshacer", async ({ page }, info) => {
    await openProject(page, 1, info.outputPath("p1.qrproj.json"));
    const before = await label(page, "qr");
    const box = await onScreen(page, "qr");
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + 5, y: box.y - 40 }, { release: false });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await label(page, "qr")).toBe(before);
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeDisabled();
  });

  test("las cajas nunca salen de la pieza aunque se arrastren muy lejos", async ({ page }, info) => {
    await openProject(page, 1, info.outputPath("p1b.qrproj.json"));
    const box = await onScreen(page, "qr");
    const svg = await page.getByTestId("layout-editor").boundingBox();
    if (!svg) throw new Error("sin editor");
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: svg.x + svg.width + 400, y: svg.y + svg.height + 400 });
    const text = (await label(page, "qr")) ?? "";
    const [, x, y, w] = /x ([\d.]+) mm, y ([\d.]+) mm, ([\d.]+) ×/.exec(text) ?? [];
    expect(Number(x) + Number(w)).toBeLessThanOrEqual(70.001);
    expect(Number(y) + Number(w)).toBeLessThanOrEqual(70.001);
  });

  test("redimensionar el QR por una esquina lo mantiene cuadrado y el bloque de texto por sus 8 manejadores", async ({ page }, info) => {
    await openProject(page, 1, info.outputPath("p1c.qrproj.json"));
    await page.getByTestId("handle-qr-nw").scrollIntoViewIfNeeded();
    const handle = await page.getByTestId("handle-qr-nw").boundingBox();
    if (!handle) throw new Error("sin manejador");
    await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + 30, y: handle.y + 30 });
    const text = (await label(page, "qr")) ?? "";
    const [, w, h] = /, ([\d.]+) × ([\d.]+) mm/.exec(text) ?? [];
    expect(w).toBe(h);
    expect(Number(w)).toBeLessThan(24.788);

    await page.getByTestId("box-content").locator("rect").first().click({ position: { x: 5, y: 5 } });
    for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) await expect(page.getByTestId(`handle-content-${h}`)).toBeVisible();
    await expect(page.getByTestId("handle-qr-nw")).toHaveCount(0);
  });

  test("teclado: flechas mueven 0,5 mm y las coordenadas se escriben a mano; un valor fuera de rango se rechaza", async ({ page }, info) => {
    await openProject(page, 1, info.outputPath("p1d.qrproj.json"));
    await page.getByTestId("box-qr").focus();
    await page.keyboard.press("ArrowRight");
    expect(await label(page, "qr")).toContain("x 23.11 mm");
    await page.getByLabel("X", { exact: true }).fill("500");
    await page.getByLabel("X", { exact: true }).press("Enter");
    await expect(page.getByText(/Debe quedar dentro de la pieza/)).toBeVisible();
    expect(await label(page, "qr")).toContain("x 23.11 mm");
  });

  test("«Solo esta pieza» no mueve las demás y «Todas» avisa de las personalizadas", async ({ page }, info) => {
    await openProject(page, 3, info.outputPath("p3b.qrproj.json"));
    await page.getByRole("button", { name: "Solo esta pieza" }).click();
    await page.getByTestId("box-qr").focus();
    await page.keyboard.press("Shift+ArrowLeft");
    const mine = await label(page, "qr");
    await page.getByRole("button", { name: "Pieza siguiente" }).click();
    await expect(page.getByTestId("piece-position")).toHaveText("Pieza 2 de 3");
    expect(await label(page, "qr")).not.toBe(mine);
    await page.getByRole("button", { name: "Todas las piezas" }).click();
    await expect(page.getByText(/1 pieza tiene posición personalizada/)).toBeVisible();
  });

  test("la vista previa de la pieza se redibuja en el servidor con la nueva posición", async ({ page }, info) => {
    await openProject(page, 1, info.outputPath("p1e.qrproj.json"));
    const image = page.getByTestId("layout-editor").locator("image");
    await expect(image).toHaveAttribute("href", /^data:image\/svg\+xml/);
    const first = await image.getAttribute("href");
    await page.getByTestId("box-qr").focus();
    await page.keyboard.press("Shift+ArrowUp");
    await expect.poll(async () => image.getAttribute("href")).not.toBe(first);
  });
});

test.describe("opciones del PDF y hojas", () => {
  test("el resultado de packGrid se actualiza en vivo y las hojas son miniaturas", async ({ page }, info) => {
    await openProject(page, 8, info.outputPath("p8.qrproj.json"));
    await expect(page.getByTestId("packing-result")).toHaveText("6 por página · 2 páginas");
    await page.getByRole("combobox", { name: "Disposición" }).focus();
    await page.keyboard.press("Enter"); // abre el menú también con el emulador táctil
    await page.getByRole("option", { name: "Una pieza por página" }).click();
    await expect(page.getByTestId("packing-result")).toContainText("8 páginas");
    await expect(page.getByTestId("download-pdf")).toBeDisabled();
  });

  test("escritorio: 1000 piezas siguen siendo fluidas y el DOM es pequeño (≤ 300 trazos)", async ({ page, isMobile }, info) => {
    test.skip(isMobile, "la medida de rendimiento se hace en escritorio");
    await openProject(page, 1000, info.outputPath("p1000.qrproj.json"));
    await expect(page.getByTestId("packing-result")).toHaveText("6 por página · 167 páginas");
    const paths = await page.locator("svg path").count();
    expect(paths).toBeLessThanOrEqual(300);
    const sheets = await page.locator('[data-testid="pdf-preview"] figure').count();
    expect(sheets).toBeLessThan(15); // virtualizadas: 167 hojas no están todas en el DOM
  });
});
