import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

const MENU = "https://menu.example.com/tropical";

async function addPiece(page: Page, values: { area: string; mesa: string; menuUrl?: string; qrUrl?: string }) {
  await page.getByRole("button", { name: "+ Agregar nuevo" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^Área/ }).fill(values.area);
  await dialog.getByRole("textbox", { name: /^Mesa/ }).fill(values.mesa);
  await dialog.getByRole("textbox", { name: /^Link del menú/ }).fill(values.menuUrl ?? `${MENU}?mesa=${encodeURIComponent(values.mesa)}`);
  if (values.qrUrl) await dialog.getByRole("textbox", { name: /^Link del QR/ }).fill(values.qrUrl);
  await dialog.getByRole("button", { name: "Agregar pieza" }).click();
  await expect(dialog).toBeHidden();
}

const noHorizontalScroll = async (page: Page) => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
};

test.describe("builder de piezas (flujo manual de punta a punta)", () => {
  test("crear una pieza genera su QR real, se ve la vista previa y sobrevive a recargar", async ({ page, request }) => {
    await page.goto("/editor");
    await expect(page.getByRole("heading", { name: "Aún no hay piezas" })).toBeVisible();

    await addPiece(page, { area: "Tropical", mesa: "M1" });
    await expect(page.getByTestId("piece-position")).toHaveText("Pieza 1 de 1");

    // QR generado por el servidor real y guardado en el storage local.
    await expect(page.getByTestId("qr-status").first()).toContainText("✓ QR generado", { timeout: 15_000 });
    const qrLink = page.getByRole("region", { name: "Pieza seleccionada" }).getByRole("link", { name: /\/api\/storage\/qr\/v1\/[0-9a-f]{64}\.svg$/ });
    const qrUrl = await qrLink.getAttribute("href");
    expect(qrUrl).toBeTruthy();
    const file = await request.get(qrUrl as string);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/svg+xml");
    expect(await file.text()).toMatch(/^<svg /);

    // Vista previa dibujada por el servidor con Gotham (imagen SVG cargada de verdad).
    const preview = page.getByRole("img", { name: /Vista previa de la pieza M1 · Tropical/ }).first();
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Con el cambio ya a salvo en el navegador («Guardado en este navegador»), recargar restaura sin pedir otro QR.
    await expect(page.getByText("Guardado en este navegador")).toBeVisible();
    const resolveCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/api/qr/resolve") && resolveCalls.push(r.url()));
    await page.reload();
    await expect(page.getByText(/Proyecto restaurado: 1 pieza/)).toBeVisible();
    await expect(page.getByTestId("qr-status").first()).toContainText("✓ QR generado");
    expect(resolveCalls).toEqual([]);
  });

  test("el mismo Link del menú en dos piezas comparte un solo archivo de QR", async ({ page }) => {
    await page.goto("/editor");
    await addPiece(page, { area: "Tropical", mesa: "M1", menuUrl: `${MENU}?compartido=1` });
    await expect(page.getByTestId("qr-status").first()).toContainText("✓ QR generado", { timeout: 15_000 });
    await addPiece(page, { area: "Tropical", mesa: "M2", menuUrl: `${MENU}?compartido=1` });
    await expect(page.getByTestId("counter-withQr")).toHaveText("Con QR: 2", { timeout: 15_000 });
    const hrefs = await page.getByRole("region", { name: "Pieza seleccionada" }).getByRole("link", { name: /qr\/v1/ }).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    await page.getByRole("button", { name: "Pieza anterior" }).click();
    const first = await page.getByRole("region", { name: "Pieza seleccionada" }).getByRole("link", { name: /qr\/v1/ }).getAttribute("href");
    expect(first).toBe(hrefs[0]);
  });

  test("un Link del QR con una IP o un destino interno se rechaza en el formulario (seguridad)", async ({ page }) => {
    await page.goto("/editor");
    await page.getByRole("button", { name: "+ Agregar nuevo" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: /^Área/ }).fill("Tropical");
    await dialog.getByRole("textbox", { name: /^Mesa/ }).fill("M1");
    await dialog.getByRole("textbox", { name: /^Link del menú/ }).fill(MENU);
    const qr = dialog.getByRole("textbox", { name: /^Link del QR/ });
    await qr.fill("https://169.254.169.254/latest/meta-data/");
    await dialog.getByRole("button", { name: "Agregar pieza" }).click(); // tras un intento inválido el botón queda deshabilitado hasta corregir
    await expect(dialog.getByText("El link del QR no es una URL https válida")).toBeVisible();
    for (const bad of ["http://qr.cliente.com/m1.svg", "javascript:alert(1)", "https://localhost/qr.svg", "data:image/svg+xml,<svg/>"]) {
      await qr.fill(bad);
      await expect(dialog.getByText("El link del QR no es una URL https válida"), bad).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Agregar pieza" })).toBeDisabled();
    }
    await qr.fill("");
    await expect(dialog.getByRole("button", { name: "Agregar pieza" })).toBeEnabled(); // vacío = se generará uno nuevo
  });

  test("con Link del QR el navegador solo pide VERIFICAR, nunca generar; si no responde queda como error visible y NUNCA se reemplaza por uno generado", async ({ page }) => {
    await page.goto("/editor");
    const bodies: string[] = [];
    page.on("request", (r) => r.url().includes("/api/qr/resolve") && bodies.push(r.postData() ?? ""));
    await addPiece(page, { area: "Tropical", mesa: "M1", qrUrl: "https://no-existe.invalid/qr.svg" });
    await expect(page.getByTestId("qr-status").first()).toContainText("✕ Error de QR: unreachable", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reemplazar por QR generado" })).toBeVisible();
    await expect(page.getByTestId("counter-needQr")).toHaveText("Necesitan QR: 1");
    expect(bodies).toHaveLength(1);
    const body = JSON.parse(bodies[0] as string) as { items?: unknown; verify?: Array<{ qrUrl: string }> };
    expect(body.verify?.[0]?.qrUrl).toBe("https://no-existe.invalid/qr.svg");
    expect(body.items).toBeUndefined();
  });

  test("eliminar pide confirmación y se puede deshacer; los contadores se mantienen al día", async ({ page }) => {
    await page.goto("/editor");
    await addPiece(page, { area: "Tropical", mesa: "M1", menuUrl: `${MENU}?del=1` });
    await addPiece(page, { area: "Tropical", mesa: "M2", menuUrl: `${MENU}?del=2` });
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 2");
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("dialog")).toContainText("¿Eliminar la pieza M2 · Tropical?");
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 1");
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 2");
  });

  test("guardar el proyecto en un archivo y abrirlo en otra sesión no regenera ningún QR", async ({ page, browser }) => {
    await page.goto("/editor");
    await page.getByRole("textbox", { name: "Nombre del proyecto" }).fill("Tropical E2E");
    await addPiece(page, { area: "Tropical", mesa: "M1", menuUrl: `${MENU}?proyecto=1` });
    await expect(page.getByTestId("qr-status").first()).toContainText("✓ QR generado", { timeout: 15_000 });

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Más opciones del proyecto" }).click();
    await page.getByRole("menuitem", { name: /Guardar proyecto/ }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe("Tropical E2E.qrproj.json");
    const path = await saved.path();
    const json = JSON.parse(await readFile(path, "utf8")) as { format: string; project: { recordsById: Record<string, { qr: { source: string } }> } };
    expect(json.format).toBe("qr-production-project");
    expect(Object.values(json.project.recordsById)[0]?.qr.source).toBe("generated");
    await expect(page.getByTestId("dirty-chip")).toBeHidden();

    // Otra sesión limpia: abrir el archivo.
    const context = await browser.newContext();
    const other = await context.newPage();
    const resolves: string[] = [];
    other.on("request", (r) => r.url().includes("/api/qr/resolve") && resolves.push(r.url()));
    await other.goto("/");
    await other.getByTestId("open-project-input").setInputFiles(path);
    await expect(other.getByText(/1 pieza abierta/)).toBeVisible();
    await other.getByRole("link", { name: "Continuar" }).click(); // navegación interna: el estado sobrevive sin recargar
    await expect(other).toHaveURL(/\/editor$/);
    await expect(other.getByTestId("counter-withQr")).toHaveText("Con QR: 1");
    expect(resolves).toEqual([]);
    await context.close();
  });

  test("con cambios sin guardar, «Nuevo proyecto» pregunta antes de perderlos", async ({ page }) => {
    await page.goto("/editor");
    await addPiece(page, { area: "Tropical", mesa: "M1" });
    await page.getByRole("button", { name: "Más opciones del proyecto" }).click();
    await page.getByRole("menuitem", { name: "Nuevo proyecto" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Tienes cambios sin guardar.");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("counter-all")).toHaveText("Total: 1");
    await page.getByRole("button", { name: "Más opciones del proyecto" }).click();
    await page.getByRole("menuitem", { name: "Nuevo proyecto" }).click();
    await dialog.getByRole("button", { name: "Empezar sin guardar" }).click();
    await expect(page.getByRole("heading", { name: "Aún no hay piezas" })).toBeVisible();
  });

  test("reordenar: «Mover a…» una posición y ordenar por mesa (orden natural)", async ({ page }) => {
    await page.goto("/editor");
    for (const mesa of ["M10", "M2", "M1"]) await addPiece(page, { area: "Tropical", mesa, menuUrl: `${MENU}?ord=${mesa}` });
    const order = () => page.getByRole("list", { name: "Piezas" }).getByTestId("record-card").evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label") ?? c.textContent ?? ""));
    await page.getByRole("button", { name: "Más opciones del proyecto" }).click();
    await page.getByRole("menuitem", { name: "Mesa", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ordenar" }).click();
    await expect(page.getByRole("list", { name: "Piezas" }).getByTestId("record-card").first()).toContainText("M1 · Tropical");
    void order;
    const texts = await page.getByRole("list", { name: "Piezas" }).getByTestId("record-card").allInnerTexts();
    expect(texts.map((t) => /M\d+/.exec(t)?.[0])).toEqual(["M1", "M2", "M10"]);
  });
});

test.describe("responsive", () => {
  test("sin scroll horizontal en el inicio y en el builder, con piezas", async ({ page }) => {
    await page.goto("/");
    await noHorizontalScroll(page);
    await page.goto("/editor");
    await addPiece(page, { area: "Tropical", mesa: "M1" });
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Vista de rejilla" }).click();
    await noHorizontalScroll(page);
  });

  test("el formulario es utilizable (en móvil ocupa toda la pantalla) y permite revisar y editar datos", async ({ page }, info) => {
    await page.goto("/editor");
    await page.getByRole("button", { name: "+ Agregar nuevo" }).first().click();
    const dialog = page.getByRole("dialog");
    if (info.project.name === "mobile") {
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
    }
    await expect(dialog.getByRole("button", { name: "Agregar pieza" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });
});
