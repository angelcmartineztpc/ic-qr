import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readFrames, type DonePayload, type FileMetaPayload, type Frame, type ProgressPayload, type WarningPayload } from "@/lib/export/frames";
import type { ExportRequestInput } from "@/schemas/export";
import { PDF_DEFAULTS } from "@/schemas/pdf";
import { EMPTY_TEMPLATE_OVERRIDES } from "@/schemas/template";
import { getTemplate } from "@/templates";
import type { QrSourceInfo } from "@/types";

import { inspectPdf, pageContents } from "../helpers/pdf-inspect";
import { HAS_PIECE_FONT } from "../helpers/piece-font";

/** POST /api/export de punta a punta: guardas reales, storage local real y el PDF/ZIP resultante inspeccionado. */
const PASSWORD = "una-clave-larga-123";
const AUTH = `Basic ${Buffer.from(`diseno:${PASSWORD}`).toString("base64")}`;
const KEY_SYMBOL = Symbol.for("qr-production-generator.draining");
let dir: string;

type Handler = (request: Request, context: unknown) => Promise<Response>;
interface Routes {
  resolve: Handler;
  exportRoute: Handler;
  limits: { exportSlots: { inUse: number } };
}

const baseEnv = (): Record<string, string> => ({
  AUTH_MODE: "basic",
  BASIC_AUTH_USER: "diseno",
  BASIC_AUTH_PASSWORD_SHA256: createHash("sha256").update(PASSWORD).digest("hex"),
  APP_ORIGINS: "http://localhost:3000",
  APP_ALLOWED_HOSTS: "localhost:3000",
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_DIR: dir,
  STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com/qr-assets",
  LOG_LEVEL: "error",
  RATE_LIMIT_RESOLVE_PER_MIN: "1000",
  RATE_LIMIT_EXPORT_PER_MIN: "1000",
});

async function load(overrides: Record<string, string> = {}): Promise<Routes> {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({ ...baseEnv(), ...overrides })) vi.stubEnv(key, value);
  const [resolve, exportRoute, http] = await Promise.all([import("@/app/api/qr/resolve/route"), import("@/app/api/export/route"), import("@/server/http")]);
  return { resolve: resolve.POST as Handler, exportRoute: exportRoute.POST as Handler, limits: http.getLimits() };
}

const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", "content-type": "application/json", ...extra });
const post = (url: string, body: unknown, extra: Record<string, string> = {}, signal?: AbortSignal) =>
  new Request(`http://localhost:3000${url}`, { method: "POST", headers: headers(extra), body: typeof body === "string" ? body : JSON.stringify(body), ...(signal ? { signal } : {}) });

type ExportRecord = ExportRequestInput["records"][number];
const MENU = (n: number) => `https://menu.example.com/lblc/${n}`;

let routes: Routes;
/** QR generados por la ruta real: lo que el cliente guardaría tras «Generar QR». */
async function generated(ids: string[], menuOf: (i: number) => string = MENU): Promise<ExportRecord[]> {
  const items = ids.map((id, i) => ({ recordId: id, menuUrl: menuOf(i), expectedRevision: 0 }));
  const body = (await (await routes.resolve(post("/api/qr/resolve", { items }), {})).json()) as { results: Array<{ recordId: string; outcome: string; qrUrl: string; qr: QrSourceInfo }> };
  return body.results.map((r, i): ExportRecord => ({ id: r.recordId, area: "Infinity Pool", estacion: "Estación 1", mesa: `B${i + 1}`, subgrupo: "", concepto: "Alimentos y Bebidas", menuUrl: menuOf(i), qrUrl: r.qrUrl, qr: r.qr }));
}

async function existing(id: string, menuUrl = MENU(0)): Promise<ExportRecord> {
  const hash = ((await generated(["tmp-existing"], () => menuUrl))[0]?.qr as { storageKey: string }).storageKey;
  const qrUrl = `https://cdn.example.com/qr-assets/${hash}`;
  const body = (await (await routes.resolve(post("/api/qr/resolve", { verify: [{ recordId: id, qrUrl, menuUrl }] }), {})).json()) as { results: Array<{ qr: QrSourceInfo }> };
  return { id, area: "Playa", estacion: "", mesa: "B9", subgrupo: "", concepto: "", menuUrl, qrUrl, qr: body.results[0]?.qr as QrSourceInfo };
}

function request(records: ExportRecord[], options: Partial<ExportRequestInput["options"]> = {}): ExportRequestInput {
  const template = getTemplate("tropical-table");
  if (!template) throw new Error("falta tropical-table");
  return {
    records,
    templateId: template.id,
    templateOverrides: structuredClone(EMPTY_TEMPLATE_OVERRIDES) as ExportRequestInput["templateOverrides"],
    layout: { templateId: template.id, base: template.defaultLayout, overrides: {} },
    options: { fileName: "Mesas LBLC", formats: ["pdf"], pdf: { ...PDF_DEFAULTS, textMode: "outlined", pageSize: { ...PDF_DEFAULTS.pageSize }, margins: { ...PDF_DEFAULTS.margins } }, svg: { textMode: "outlined", cutLine: false }, zipNaming: "index", ...options },
  } as ExportRequestInput;
}

interface Collected {
  frames: Frame[];
  progress: ProgressPayload[];
  metas: FileMetaPayload[];
  warnings: WarningPayload[];
  done?: DonePayload;
  error?: { code: string; message: string; recordId?: string };
  files: Record<string, Uint8Array>;
}
async function collect(response: Response): Promise<Collected> {
  const out: Collected = { frames: [], progress: [], metas: [], warnings: [], files: {} };
  const parts: Record<string, Uint8Array[]> = {};
  for await (const frame of readFrames(response.body as ReadableStream<Uint8Array>)) {
    out.frames.push(frame);
    if (frame.type === 1) out.progress.push(frame.payload);
    else if (frame.type === 2) out.metas.push(frame.payload);
    else if (frame.type === 3) (parts[frame.fileId] ??= []).push(frame.data);
    else if (frame.type === 4) out.done = frame.payload;
    else if (frame.type === 5) out.warnings.push(frame.payload);
    else if (frame.type === 6) out.error = frame.payload;
  }
  for (const [id, chunks] of Object.entries(parts)) {
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    out.files[id] = bytes;
  }
  return out;
}
const run = (body: unknown, extra: Record<string, string> = {}) => routes.exportRoute(post("/api/export", body, extra), {});
const storageFiles = async () => {
  const walk = async (path: string): Promise<string[]> => (await readdir(path, { withFileTypes: true }).catch(() => [])).flatMap((e) => (e.isDirectory() ? [] : [join(path, e.name)]));
  return [...(await walk(join(dir, "qr", "v1"))), ...(await walk(join(dir, "qr", "ext", "v1")))].sort();
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-export-"));
  routes = await load();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  (globalThis as Record<symbol, unknown>)[KEY_SYMBOL] = false;
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!HAS_PIECE_FONT)("POST /api/export (requiere la fuente de las piezas: bun run fonts:setup)", () => {
  it("con los valores por defecto el texto es vivo (editable en Illustrator) y sigue sin imágenes", async () => {
    expect(PDF_DEFAULTS.textMode).toBe("live");
    const records = [...(await generated(["a", "b"]))];
    const input = request(records, { formats: ["pdf", "svgZip"], pdf: { ...PDF_DEFAULTS, pageSize: { ...PDF_DEFAULTS.pageSize }, margins: { ...PDF_DEFAULTS.margins } }, svg: { textMode: "live", cutLine: false } });
    const response = await run(input);
    if (response.status !== 200) throw new Error(JSON.stringify(await response.json()));
    const out = await collect(response);
    expect(out.error).toBeUndefined();

    const pdf = out.files["pdf"] as Uint8Array;
    const report = await inspectPdf(pdf);
    expect(report).toMatchObject({ imageObjects: 0 });
    expect(report.fontFiles).toBeGreaterThan(0); // la fuente va incrustada
    const [content] = await pageContents(pdf);
    expect(content).toMatch(/\bBT\b/); // texto real, no trazos

    const svg = new TextDecoder().decode(unzipSync(out.files["zip"] as Uint8Array)["001.svg"]);
    expect(svg).toMatch(/<text [^>]*font-family="Address Sans Pro Cd"/);
    expect(svg).not.toMatch(/<image|<script/);
  });

  it("PDF vectorial y ZIP de SVG numerado 001…; el stream trae progreso, metadatos, chunks y DONE", async () => {
    const records = [...(await generated(["a", "b", "c"])), await existing("d")];
    const response = await run(request(records, { formats: ["pdf", "svgZip"] }));
    if (response.status !== 200) throw new Error(JSON.stringify(await response.json()));
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const out = await collect(response);

    expect(out.error).toBeUndefined();
    expect(out.done).toMatchObject({ pages: 1, pieces: 4 });
    expect(out.progress[0]).toEqual({ phase: "generating", done: 0, total: 4 });
    expect(out.progress.at(-2)).toMatchObject({ phase: "generating", done: 4, total: 4 });
    expect(out.progress.at(-1)).toMatchObject({ phase: "preparing" });
    expect(out.metas.map((m) => [m.fileId, m.name, m.mime])).toEqual([["pdf", "Mesas LBLC.pdf", "application/pdf"], ["zip", "Mesas LBLC.zip", "application/zip"]]);
    for (const meta of out.metas) expect(out.files[meta.fileId]?.length).toBe(meta.size);

    const pdf = out.files["pdf"] as Uint8Array;
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    const report = await inspectPdf(pdf);
    expect(report).toMatchObject({ pageCount: 1, imageObjects: 0, fontFiles: 0 });
    expect(report.mediaBoxes[0]?.[2]).toBeCloseTo(595.276, 2);
    const [content] = await pageContents(pdf);
    expect(content).not.toMatch(/\bBT\b/); // texto en contornos
    expect(content?.match(/^f\*$/gm)?.length).toBe(4); // un trazo compuesto de QR por pieza

    const zip = unzipSync(out.files["zip"] as Uint8Array);
    expect(Object.keys(zip)).toEqual(["001.svg", "002.svg", "003.svg", "004.svg"]);
    const svg = new TextDecoder().decode(zip["002.svg"]);
    expect(svg).toMatch(/^<svg [^>]*width="70mm" height="70mm" viewBox="0 0 700 700"/);
    expect(svg).not.toMatch(/<text|<image|<style|<script/);
  });

  it("no sube nada ni crea QR: el storage queda exactamente igual (AC28)", async () => {
    const records = await generated(["a", "b"]);
    const before = await storageFiles();
    await collect(await run(request(records, { formats: ["pdf", "svgZip"] })));
    expect(await storageFiles()).toEqual(before);
  });

  it("estilo del QR: los QR generados se dibujan con estilo y logo; el QR existente se imprime tal cual; el storage no cambia", async () => {
    const records = [...(await generated(["a", "b"])), await existing("c")];
    const before = await storageFiles();
    const input = request(records, { formats: ["pdf", "svgZip"] });
    input.templateOverrides.qrStyle = {
      outline: "square",
      modules: "dots",
      eyeFrame: "rounded",
      eyeBall: "circle",
      colors: { modules: "#274C69", eyeFrame: "#12324A", eyeBall: null, background: null },
      logo: {
        geometry: { viewBox: [0, 0, 100, 100], nodes: [{ type: "path", d: "M50 4L96 50L50 96L4 50Z", fill: "#274C69", fillRule: "nonzero" }] },
        sizePct: 18,
        marginModules: 1,
        color: null,
        fileName: "logo.svg",
      },
    };
    const response = await run(input);
    if (response.status !== 200) throw new Error(JSON.stringify(await response.json()));
    const out = await collect(response);
    expect(out.error).toBeUndefined();
    expect(out.done).toMatchObject({ pieces: 3 });

    const zip = unzipSync(out.files["zip"] as Uint8Array);
    const svg = (name: string) => new TextDecoder().decode(zip[name]);
    for (const styledPiece of ["001.svg", "002.svg"]) {
      expect(svg(styledPiece)).toContain('id="qr-eye-frame"');
      expect(svg(styledPiece)).toContain('id="qr-eye-ball"');
      expect(svg(styledPiece)).toContain('id="qr-logo"');
      expect(svg(styledPiece)).toContain('fill="#274C69"');
      expect(svg(styledPiece)).not.toMatch(/<image|<script|<style/);
    }
    // La pieza con QR existente conserva su QR: nada de marcos, pupilas ni logo.
    expect(svg("003.svg")).toContain('id="qr-code"');
    expect(svg("003.svg")).not.toMatch(/qr-eye-frame|qr-eye-ball|qr-logo/);

    const pdf = out.files["pdf"] as Uint8Array;
    expect(await inspectPdf(pdf)).toMatchObject({ pageCount: 1, imageObjects: 0 });
    expect(await storageFiles()).toEqual(before); // estilizar no crea ni cambia ningún QR guardado
  });

  it("la numeración del ZIP es 1…n sobre la lista exportada (las excluidas ni viajan); con nombre por área y mesa", async () => {
    const all = await generated(["a", "b", "c", "d"]);
    const included = all.filter((r) => r.id !== "b");
    const out = await collect(await run(request(included, { formats: ["svgZip"], zipNaming: "index-area-mesa" })));
    expect(Object.keys(unzipSync(out.files["zip"] as Uint8Array))).toEqual(["001-infinity-pool-b1.svg", "002-infinity-pool-b3.svg", "003-infinity-pool-b4.svg"]);
    expect(out.files["pdf"]).toBeUndefined();
    expect(out.done).toMatchObject({ pages: 0, pieces: 3 });
  });

  it("texto vivo: el PDF incrusta la fuente y conserva el texto", async () => {
    const records = await generated(["a"]);
    const out = await collect(await run(request(records, { pdf: { ...PDF_DEFAULTS, pageSize: { kind: "A4" }, margins: { ...PDF_DEFAULTS.margins }, textMode: "live" } as never })));
    const report = await inspectPdf(out.files["pdf"] as Uint8Array);
    expect(report.fontFiles).toBeGreaterThanOrEqual(1);
    expect(report.fontNames.every((n) => /AddressSansPro/.test(n))).toBe(true);
  });

  it("una pieza con módulos del QR demasiado pequeños deja un WARNING y cuenta en DONE", async () => {
    const records = await generated(["a", "b"], (i) => (i === 0 ? `https://menu.example.com/${"a".repeat(120)}` : MENU(1)));
    const out = await collect(await run(request(records)));
    expect(out.warnings).toEqual([expect.objectContaining({ recordId: "a", code: "QR_MODULE_SMALL", message: expect.stringContaining("módulos del QR") })]);
    expect(out.done?.warnings).toBe(1);
  });

  it("modo «una pieza por página» y hoja: páginas en DONE", async () => {
    const records = await generated(["a", "b", "c"]);
    const single = await collect(await run(request(records, { pdf: { ...PDF_DEFAULTS, mode: "single", pageSize: { kind: "A4" }, margins: { ...PDF_DEFAULTS.margins } } as never })));
    expect(single.done).toMatchObject({ pages: 3, pieces: 3 });
    expect((await inspectPdf(single.files["pdf"] as Uint8Array)).pageCount).toBe(3);
  });
});

describe.skipIf(!HAS_PIECE_FONT)("POST /api/export — bloqueos (400 con detalle por pieza)", () => {
  const detail = async (response: Response) => (await response.json()) as { code: string; message: string; details?: Array<{ path: string; message: string; recordId?: string }> };

  it("QR pendiente, desactualizado sin confirmar y con errores: 400 y cada problema dice qué pieza es", async () => {
    const [ok, stale] = await generated(["ok", "stale"]);
    const pending: ExportRecord = { ...(ok as ExportRecord), id: "pending", qr: { source: "none" }, qrUrl: "" };
    const changed: ExportRecord = { ...(stale as ExportRecord), menuUrl: "https://menu.example.com/otro" };
    const broken: ExportRecord = { ...(ok as ExportRecord), id: "broken", mesa: "" };
    const response = await run(request([ok as ExportRecord, pending, changed, broken]));
    expect(response.status).toBe(400);
    const body = await detail(response);
    expect(body.code).toBe("VALIDATION_FAILED");
    const ids = new Set(body.details?.map((d) => d.recordId));
    expect(ids).toEqual(new Set(["pending", "stale", "broken"]));
    expect(body.details?.find((d) => d.recordId === "stale")?.message).toMatch(/desactualizado/);
    expect(await storageFiles()).toEqual(await storageFiles()); // sigue sin escribir
  });

  it("un QR desactualizado CON confirmación válida sí se exporta", async () => {
    const [stale] = await generated(["stale"]);
    const record = stale as ExportRecord;
    const payload = (record.qr as { payload: string }).payload;
    const changed: ExportRecord = { ...record, menuUrl: "https://menu.example.com/otro", qrAck: { kind: "stale", menuUrl: "https://menu.example.com/otro", qrFingerprint: payload, at: "2026-10-08T10:00:00.000Z" } };
    const out = await collect(await run(request([changed])));
    expect(out.error).toBeUndefined();
    expect(out.done?.pieces).toBe(1);
  });

  it("identidad del QR: una clave o un link manipulados se rechazan (QR_IDENTITY_MISMATCH) y nada se dibuja", async () => {
    const [good, other] = await generated(["good", "other"]);
    const tamperedKey: ExportRecord = { ...(good as ExportRecord), qr: { ...(good as ExportRecord).qr, storageKey: (other as ExportRecord & { qr: { storageKey: string } }).qr.storageKey } as QrSourceInfo };
    const tamperedUrl: ExportRecord = { ...(other as ExportRecord), id: "url", qrUrl: (good as ExportRecord).qrUrl };
    for (const bad of [tamperedKey, tamperedUrl]) {
      const response = await run(request([bad]));
      expect(response.status).toBe(400);
      expect(await detail(response)).toMatchObject({ code: "QR_IDENTITY_MISMATCH", details: { recordId: bad.id } });
    }
  });

  it("plantilla desconocida, ajustes de plantilla inválidos, registros repetidos y cuerpo mal formado → 400", async () => {
    const records = await generated(["a"]);
    expect((await run({ ...request(records), templateId: "no-existe", layout: { ...request(records).layout, templateId: "no-existe" } })).status).toBe(400);
    expect((await run({ ...request(records), templateOverrides: { items: { area: { weight: 300 } }, qr: {}, tile: {} } })).status).toBe(400);
    expect((await run(request([...records, ...records]))).status).toBe(400);
    expect((await run("{no es json")).status).toBe(400);
    expect((await run({ ...request(records), extra: true })).status).toBe(400);
    expect((await run(request([]))).status).toBe(400);
  });
});

describe.skipIf(!HAS_PIECE_FONT)("POST /api/export — guardas, cancelación, tiempo y apagado", () => {
  it("401 sin credenciales, 415 con otro Content-Type, 403 entre sitios y 421 con otro Host", async () => {
    const body = request(await generated(["a"]));
    expect((await run(body, { authorization: "" })).status).toBe(401);
    expect((await run(body, { "content-type": "text/plain" })).status).toBe(415);
    expect((await run(body, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await run(body, { host: "evil.example" })).status).toBe(421);
  });

  it("413 si el cuerpo supera EXPORT_MAX_BODY_BYTES", async () => {
    const small = await load({ EXPORT_MAX_BODY_BYTES: "2048" });
    const records = await generated(["a", "b", "c", "d", "e", "f"]);
    expect((await small.exportRoute(post("/api/export", request(records)), {})).status).toBe(413);
    routes = await load();
  });

  it("cancelar a mitad detiene el bucle: el stream termina sin DONE y el hueco del semáforo se libera", async () => {
    const [one] = await generated(["base"]);
    const many = Array.from({ length: 1500 }, (_, i): ExportRecord => ({ ...(one as ExportRecord), id: `r${i}`, mesa: `M${i}` }));
    const controller = new AbortController();
    const response = await routes.exportRoute(post("/api/export", request(many), {}, controller.signal), {});
    expect(routes.limits.exportSlots.inUse).toBe(1);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // primer frame de progreso
    controller.abort();
    await reader.cancel();
    await vi.waitFor(() => expect(routes.limits.exportSlots.inUse).toBe(0), { timeout: 5000 });
    const next = await collect(await run(request([one as ExportRecord])));
    expect(next.done?.pieces).toBe(1);
  }, 30_000);

  it("el tiempo máximo (EXPORT_TIMEOUT_MS) corta la exportación con un ERROR EXPORT_TIMEOUT y sin DONE", async () => {
    const fast = await load({ EXPORT_TIMEOUT_MS: "1000" });
    routes = fast;
    const [one] = await generated(["base"]);
    const many = Array.from({ length: 2500 }, (_, i): ExportRecord => ({ ...(one as ExportRecord), id: `r${i}`, mesa: `M${i}` }));
    const out = await collect(await run(request(many)));
    expect(out.done).toBeUndefined();
    expect(out.error).toMatchObject({ code: "EXPORT_TIMEOUT" });
    expect(fast.limits.exportSlots.inUse).toBe(0);
    routes = await load();
  }, 60_000);

  it("el servidor ocupado responde 429 sin encolar (2 exportaciones simultáneas por instancia)", async () => {
    const [one] = await generated(["base"]);
    const many = Array.from({ length: 1200 }, (_, i): ExportRecord => ({ ...(one as ExportRecord), id: `r${i}`, mesa: `M${i}` }));
    const a = await routes.exportRoute(post("/api/export", request(many)), {});
    const b = await routes.exportRoute(post("/api/export", request(many)), {});
    const c = await run(request(many));
    expect([a.status, b.status, c.status]).toEqual([200, 200, 429]);
    expect(c.headers.get("retry-after")).toBe("5");
    await Promise.all([a.body?.cancel(), b.body?.cancel()]);
    await vi.waitFor(() => expect(routes.limits.exportSlots.inUse).toBe(0), { timeout: 10_000 });
  }, 30_000);

  it("con el servidor en apagado ordenado (SIGTERM) se rechaza con 503 y Retry-After", async () => {
    const body = request(await generated(["a"]));
    (globalThis as Record<symbol, unknown>)[KEY_SYMBOL] = true;
    try {
      const response = await run(body);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("10");
      expect(((await response.json()) as { code: string }).code).toBe("DRAINING");
    } finally {
      (globalThis as Record<symbol, unknown>)[KEY_SYMBOL] = false;
    }
  });

  it("sin las fuentes de las piezas en el servidor: 503 FONTS_MISSING antes de abrir el stream", async () => {
    const empty = await mkdtemp(join(tmpdir(), "qrpg-nofonts-"));
    try {
      const noFonts = await load({ FONTS_DIR: empty });
      const records = await generated(["a"]);
      const response = await noFonts.exportRoute(post("/api/export", request(records)), {});
      expect(response.status).toBe(503);
      expect(((await response.json()) as { code: string }).code).toBe("FONTS_MISSING");
    } finally {
      await rm(empty, { recursive: true, force: true });
      routes = await load();
    }
  });
});
