import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

import { CHUNK_BYTES, encodeFrame } from "../../src/lib/export/frames";
import { addRecord, createEmptyProject, setProjectName } from "../../src/lib/state/project";
import { serializeProjectFile } from "../../src/lib/state/project-file";

const NOW = "2026-10-08T10:00:00.000Z";
const MENU = "https://menu.example.com/lblc";

/** Abre un proyecto de piezas SIN QR (el flujo real: «Descargar» los resuelve primero) y va a /preview. */
async function openProject(page: Page, file: string, pieces: Array<{ id: string; mesa: string; qrUrl?: string }>) {
  let project = setProjectName(createEmptyProject(NOW, { id: "ex" }), "Exportación");
  for (const piece of pieces) {
    project = addRecord(project, { area: "Infinity Pool", estacion: "", mesa: piece.mesa, subgrupo: "", concepto: "", menuUrl: `${MENU}/${piece.mesa}`, ...(piece.qrUrl ? { qrUrl: piece.qrUrl } : {}) }, NOW, { id: piece.id }).state;
  }
  await writeFile(file, serializeProjectFile(project, NOW));
  await page.goto("/");
  await page.getByTestId("open-project-input").setInputFiles(file);
  await expect(page.getByText(/piezas? abiertas?/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); // autoguardado antes de cambiar de página
  await page.goto("/preview");
  await expect(page.getByTestId("layout-editor")).toBeVisible({ timeout: 20_000 });
}

const pieces = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, mesa: `B${i + 1}` }));

test.describe("descargar el PDF (AC25, AC29–AC32)", () => {
  test("genera los QR pendientes, exporta y descarga un PDF vectorial; el proyecto queda como exportado", async ({ page }, info) => {
    await openProject(page, info.outputPath("p.qrproj.json"), pieces(5));
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByTestId("download-pdf").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^qr-production-\d{4}-\d{2}-\d{2}-\d{4}\.pdf$/);
    const pdf = await readFile(await file.path());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    await expect(page.getByText("PDF descargado correctamente", { exact: true })).toBeVisible();
    await expect(page.getByTestId("last-export")).toContainText("5 piezas en 1 página");
    await expect(page.getByRole("dialog")).toHaveCount(0); // el diálogo de progreso se cierra
  });

  test("con ZIP: el PDF se descarga solo y el ZIP se ofrece aparte, con un SVG por pieza numerado 001…", async ({ page }, info) => {
    await openProject(page, info.outputPath("z.qrproj.json"), pieces(3));
    await page.getByLabel("También un ZIP con un SVG por pieza").check();
    const pdf = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByTestId("download-pdf").click();
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.getByText("PDF descargado correctamente", { exact: true })).toBeVisible();
    const zipDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar ZIP" }).first().click();
    const zip = await zipDownload;
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const entries = unzipSync(new Uint8Array(await readFile(await zip.path())));
    expect(Object.keys(entries)).toEqual(["001.svg", "002.svg", "003.svg"]);
    expect(new TextDecoder().decode(entries["001.svg"])).toMatch(/^<svg [^>]*width="70mm"/);
  });

  test("una pieza que no se puede resolver bloquea: el diálogo la lista y [Excluir] exporta el resto", async ({ page }, info) => {
    await openProject(page, info.outputPath("b.qrproj.json"), [...pieces(2), { id: "bad", mesa: "X1", qrUrl: "https://qr.cliente.invalid/x1.svg" }]);
    await page.getByTestId("download-pdf").click();
    const list = page.getByTestId("blockers-list");
    await expect(list).toBeVisible({ timeout: 60_000 });
    await expect(list).toContainText("X1");
    await expect(page.getByRole("dialog")).toContainText("Hay 1 pieza con errores; corrígela antes de generar el PDF");

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByTestId("exclude-blocked").click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.getByTestId("excluded-note")).toContainText("1 pieza excluida");
    await expect(page.getByTestId("last-export")).toContainText("2 piezas");
    // Un aviso de error persistente (el QR que falló) puede quedar encima del botón en pantallas pequeñas: el clic se envía al botón sin pasar por encima.
    await page.getByRole("button", { name: "Volver a incluirlas" }).dispatchEvent("click");
    await expect(page.getByTestId("excluded-note")).toHaveCount(0);
  });

  test("[Ir a corregir] lleva a la pieza que bloquea en /editor", async ({ page }, info) => {
    await openProject(page, info.outputPath("f.qrproj.json"), [...pieces(1), { id: "bad", mesa: "X9", qrUrl: "https://qr.cliente.invalid/x9.svg" }]);
    await page.getByTestId("download-pdf").click();
    await expect(page.getByTestId("blockers-list")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("fix-blocked").click();
    await page.waitForURL("**/editor");
    await expect(page.getByText("X9").first()).toBeVisible();
  });
});

/** Respuestas simuladas del servidor: para probar cancelar, cortes de red y fallos sin esperar a un servidor lento. */
test.describe("cancelar, cortes y errores", () => {
  const stubbed = (page: Page, respond: (n: number) => Promise<{ status?: number; body: Uint8Array | string; contentType?: string } | "hang">) => {
    let calls = 0;
    return page.route("**/api/export", async (route) => {
      const answer = await respond(++calls);
      if (answer === "hang") return; // la petición queda abierta hasta que el cliente la aborte
      await route.fulfill({ status: answer.status ?? 200, contentType: answer.contentType ?? "application/octet-stream", body: Buffer.from(answer.body) });
    });
  };
  const concat = (parts: Uint8Array[]) => Buffer.concat(parts);
  const goodBody = () => {
    const pdf = new Uint8Array(CHUNK_BYTES + 10).fill(37);
    return concat([
      encodeFrame.progress({ phase: "generating", done: 3, total: 3 }),
      encodeFrame.progress({ phase: "preparing", done: 3, total: 3 }),
      encodeFrame.fileMeta({ fileId: "pdf", name: "Simulado.pdf", size: pdf.length, mime: "application/pdf" }),
      encodeFrame.fileChunk("pdf", pdf.subarray(0, CHUNK_BYTES)),
      encodeFrame.fileChunk("pdf", pdf.subarray(CHUNK_BYTES)),
      encodeFrame.done({ pages: 1, pieces: 3, warnings: 0 }),
    ]);
  };

  test("cancelar durante la generación muestra «Descarga cancelada» y no descarga nada", async ({ page }, info) => {
    await openProject(page, info.outputPath("c.qrproj.json"), pieces(3));
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await stubbed(page, async () => "hang");
    await page.getByTestId("download-pdf").click();
    await expect(page.getByRole("dialog")).toContainText("Generando PDF…", { timeout: 60_000 });
    await expect(page.getByTestId("generation-status")).toBeVisible();
    await page.getByTestId("download-cancel").click();
    await expect(page.getByText("Descarga cancelada", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(downloaded).toBe(false);
    await expect(page.getByTestId("download-pdf")).toBeEnabled();
  });

  test("un stream cortado muestra «La descarga se interrumpió» y [Reintentar] lo completa", async ({ page }, info) => {
    await openProject(page, info.outputPath("t.qrproj.json"), pieces(3));
    await stubbed(page, async (n) => (n === 1 ? { body: concat([encodeFrame.progress({ phase: "generating", done: 1, total: 3 })]) } : { body: goodBody() }));
    await page.getByTestId("download-pdf").click();
    await expect(page.getByText("La descarga se interrumpió", { exact: true })).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Reintentar" }).click();
    expect((await download).suggestedFilename()).toBe("Simulado.pdf");
    await expect(page.getByText("PDF descargado correctamente", { exact: true })).toBeVisible();
  });

  test("errores del servidor: límite de solicitudes (aviso) y fallo interno (error con el motivo)", async ({ page }, info) => {
    await openProject(page, info.outputPath("e.qrproj.json"), pieces(2));
    await stubbed(page, async (n) =>
      n === 1
        ? { status: 429, contentType: "application/json", body: JSON.stringify({ code: "RATE_LIMITED", message: "Demasiadas solicitudes; vuelve a intentarlo en 5 s", requestId: "q" }) }
        : { status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL", message: "Error interno. Referencia: abc", requestId: "q" }) },
    );
    await page.getByTestId("download-pdf").click();
    await expect(page.getByText("Demasiadas solicitudes; vuelve a intentarlo en 5 s")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByText("Error al generar el PDF: Error interno. Referencia: abc")).toBeVisible();
  });

  test("sin conexión con el servidor: mensaje útil", async ({ page }, info) => {
    await openProject(page, info.outputPath("n.qrproj.json"), pieces(2));
    await page.route("**/api/export", (route) => route.abort("connectionfailed"));
    await page.getByTestId("download-pdf").click();
    await expect(page.getByText(/Revisa tu conexión/)).toBeVisible({ timeout: 60_000 });
  });

  test("mientras se genera, salir de la página pide confirmación al navegador (beforeunload)", async ({ page }, info) => {
    await openProject(page, info.outputPath("u.qrproj.json"), pieces(2));
    await stubbed(page, async () => "hang");
    await page.getByTestId("download-pdf").click();
    await expect(page.getByRole("dialog")).toContainText("Generando PDF…", { timeout: 60_000 });
    const prevented = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await page.getByTestId("download-cancel").click();
  });
});
