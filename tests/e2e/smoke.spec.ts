import { expect, test } from "@playwright/test";

test("el dashboard ofrece crear manualmente e importar Excel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Piezas de producción" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Agregar nuevo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar Excel" }).first()).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("las cabeceras de seguridad están presentes", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
