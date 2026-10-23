import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { LinkInfoSchema, ShortenResponseSchema, type ShortenItem } from "@/schemas/links";

/** Acortador de links de punta a punta: guardas reales, storage local real y el redirect público. */
const PASSWORD = "una-clave-larga-123";
const AUTH = `Basic ${Buffer.from(`diseno:${PASSWORD}`).toString("base64")}`;
const KEY_SYMBOL = Symbol.for("qr-production-generator.draining");
const DOMAIN = "https://qr.example.com";
let dir: string;

type Handler = (request: Request, context: unknown) => Promise<Response>;
interface Routes {
  shorten: Handler;
  link: { GET: Handler; PATCH: Handler };
  redirect: (request: Request, context: unknown) => Promise<Response>;
  storage: (request: Request, context: unknown) => Promise<Response>;
}
let routes: Routes;

const LONG = `https://menu.palaceresorts.com/restaurant/leblanc-los-cabos/carta?utm_source=qr&utm_medium=mesa&id=${"x".repeat(180)}`;
const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", "content-type": "application/json", ...extra });
const post = (url: string, body: unknown, extra: Record<string, string> = {}) => new Request(`http://localhost:3000${url}`, { method: "POST", headers: headers(extra), body: JSON.stringify(body) });
const patch = (code: string, body: unknown, extra: Record<string, string> = {}) => new Request(`http://localhost:3000/api/links/${code}`, { method: "PATCH", headers: headers(extra), body: JSON.stringify(body) });
const get = (url: string, extra: Record<string, string> = {}) => new Request(`http://localhost:3000${url}`, { headers: headers(extra) });
const ctxOf = (code: string) => ({ params: Promise.resolve({ code }) });
// Las respuestas se validan con los MISMOS esquemas que usa el navegador: si el servidor añadiera o quitara un campo, aquí se vería.
const shorten = async (urls: string[]): Promise<ShortenItem[]> => ShortenResponseSchema.parse(await (await routes.shorten(post("/api/links/shorten", { urls }), {})).json()).results;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-links-"));
  vi.resetModules();
  vi.unstubAllEnvs();
  const env: Record<string, string> = {
    AUTH_MODE: "basic",
    BASIC_AUTH_USER: "diseno",
    BASIC_AUTH_PASSWORD_SHA256: createHash("sha256").update(PASSWORD).digest("hex"),
    APP_ORIGINS: "http://localhost:3000",
    APP_ALLOWED_HOSTS: "localhost:3000",
    STORAGE_PROVIDER: "local",
    STORAGE_LOCAL_DIR: dir,
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com/qr-assets",
    NEXT_PUBLIC_QR_DOMAIN: DOMAIN,
    LOG_LEVEL: "error",
    RATE_LIMIT_LINKS_PER_MIN: "1000",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [shortenRoute, linkRoute, redirectRoute, storageRoute] = await Promise.all([
    import("@/app/api/links/shorten/route"),
    import("@/app/api/links/[code]/route"),
    import("@/app/s/[code]/route"),
    import("@/app/api/storage/[...key]/route"),
  ]);
  routes = { shorten: shortenRoute.POST as Handler, link: { GET: linkRoute.GET as Handler, PATCH: linkRoute.PATCH as Handler }, redirect: redirectRoute.GET as never, storage: storageRoute.GET as never };
});
afterAll(async () => {
  vi.unstubAllEnvs();
  (globalThis as Record<symbol, unknown>)[KEY_SYMBOL] = false;
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/links/shorten", () => {
  it("acorta, y repetir la llamada devuelve el mismo link corto sin crear otro registro", async () => {
    const [first] = await shorten([LONG]);
    expect(first).toMatchObject({ url: LONG, status: "created" });
    expect(first?.shortUrl).toMatch(new RegExp(`^${DOMAIN}/s/[2-9a-hjkmnp-z]{8}$`));
    expect(first?.shortUrl?.length).toBeLessThan(LONG.length / 4);
    const [second] = await shorten([LONG]);
    expect(second).toMatchObject({ status: "reused", code: first?.code, shortUrl: first?.shortUrl });
    const files = await readdir(join(dir, "s", "v1"));
    expect(files.filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"))).toEqual([`${first?.code}.json`]);
  });

  it("un link inválido no detiene al resto; un link propio se conserva", async () => {
    const [made] = await shorten([LONG]);
    const results = await shorten(["esto no es un link", "https://menu.example.com/otra", made?.shortUrl ?? "", `${DOMAIN}/api/qr/TGPC/pool`]);
    expect(results.map((r) => r.status)).toEqual(["invalid", "created", "kept", "kept"]);
  });

  it("400 con un cuerpo no válido o demasiados links; 401 sin credenciales; 415 con otro Content-Type; 403 entre sitios", async () => {
    expect((await routes.shorten(post("/api/links/shorten", { urls: [] }), {})).status).toBe(400);
    expect((await routes.shorten(post("/api/links/shorten", { urls: Array.from({ length: 201 }, (_, i) => `https://menu.example.com/${i}`) }), {})).status).toBe(400);
    expect((await routes.shorten(post("/api/links/shorten", { urls: ["https://a.example.com/"] }, { authorization: "" }), {})).status).toBe(401);
    expect((await routes.shorten(post("/api/links/shorten", { urls: ["https://a.example.com/"] }, { "content-type": "text/plain" }), {})).status).toBe(415);
    expect((await routes.shorten(post("/api/links/shorten", { urls: ["https://a.example.com/"] }, { "sec-fetch-site": "cross-site" }), {})).status).toBe(403);
  });
});

describe("GET /s/{código} (público)", () => {
  it("redirige 302 al destino sin pedir credenciales, y no se guarda en caché del navegador", async () => {
    const [made] = await shorten(["https://menu.example.com/carta-publica"]);
    const response = await routes.redirect(new Request(`http://localhost:3000/s/${made?.code}`), ctxOf(made?.code ?? ""));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://menu.example.com/carta-publica");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("acepta el código en mayúsculas; uno desconocido o mal formado da 404", async () => {
    const [made] = await shorten(["https://menu.example.com/mayusculas"]);
    expect((await routes.redirect(new Request("http://localhost:3000/s/x"), ctxOf((made?.code ?? "").toUpperCase()))).status).toBe(302);
    for (const code of ["zzzzzzzz", "abc", "ab3de9x0", "../etc/passwd"]) {
      expect((await routes.redirect(new Request("http://localhost:3000/s/x"), ctxOf(code))).status, code).toBe(404);
    }
  });
});

describe("GET y PATCH /api/links/{código}", () => {
  it("cambiar el destino hace que el MISMO link corto lleve al nuevo y guarda el anterior", async () => {
    const [made] = await shorten(["https://menu.example.com/antes"]);
    const code = made?.code ?? "";
    // Se calienta la caché del redirect con el destino viejo.
    expect((await routes.redirect(new Request("http://localhost:3000/s/x"), ctxOf(code))).headers.get("location")).toBe("https://menu.example.com/antes");

    const response = await routes.link.PATCH(patch(code, { destination: "https://menu.example.com/despues" }), ctxOf(code));
    expect(response.status).toBe(200);
    const info = LinkInfoSchema.parse(await response.json());
    expect(info).toMatchObject({ code, shortUrl: `${DOMAIN}/s/${code}`, destination: "https://menu.example.com/despues", originalUrl: "https://menu.example.com/antes", revision: 2 });
    expect(info.history[0]?.destination).toBe("https://menu.example.com/antes");

    // El cambio se ve de inmediato (la caché se vació) y el código no cambió.
    expect((await routes.redirect(new Request("http://localhost:3000/s/x"), ctxOf(code))).headers.get("location")).toBe("https://menu.example.com/despues");
    // Volver a acortar el link ORIGINAL devuelve el mismo código y no pisa el destino nuevo.
    expect((await shorten(["https://menu.example.com/antes"]))[0]).toMatchObject({ status: "reused", code });
    const read = LinkInfoSchema.parse(await (await routes.link.GET(get(`/api/links/${code}`), ctxOf(code))).json());
    expect(read.destination).toBe("https://menu.example.com/despues");
  });

  it("rechaza un destino inválido (400), un código desconocido (404) y un cambio de otra persona (409)", async () => {
    const [made] = await shorten(["https://menu.example.com/validaciones"]);
    const code = made?.code ?? "";
    expect((await routes.link.PATCH(patch(code, { destination: "javascript:alert(1)" }), ctxOf(code))).status).toBe(400);
    expect((await routes.link.PATCH(patch(code, { destination: `${DOMAIN}/s/ab3de9xk` }), ctxOf(code))).status).toBe(400);
    expect((await routes.link.PATCH(patch("zzzzzzzz", { destination: "https://a.example.com/" }), ctxOf("zzzzzzzz"))).status).toBe(404);
    expect((await routes.link.GET(get("/api/links/zzzzzzzz"), ctxOf("zzzzzzzz"))).status).toBe(404);
    expect((await routes.link.PATCH(patch(code, { destination: "https://a.example.com/" }, { "if-match": '"1"' }), ctxOf(code))).status).toBe(200);
    expect((await routes.link.PATCH(patch(code, { destination: "https://b.example.com/" }, { "if-match": '"1"' }), ctxOf(code))).status).toBe(409);
  });

  it("exige credenciales, mismo origen y JSON", async () => {
    expect((await routes.link.PATCH(patch("ab3de9xk", { destination: "https://a.example.com/" }, { authorization: "" }), ctxOf("ab3de9xk"))).status).toBe(401);
    expect((await routes.link.PATCH(patch("ab3de9xk", { destination: "https://a.example.com/" }, { "sec-fetch-site": "cross-site" }), ctxOf("ab3de9xk"))).status).toBe(403);
    expect((await routes.link.GET(get("/api/links/ab3de9xk", { authorization: "" }), ctxOf("ab3de9xk"))).status).toBe(401);
  });
});

describe("el registro de un link nunca se sirve por /api/storage", () => {
  it("pedir la clave s/v1/{código}.json da 404 aunque el archivo exista", async () => {
    const [made] = await shorten(["https://menu.example.com/privado"]);
    const response = await routes.storage(new Request(`http://localhost:3000/api/storage/s/v1/${made?.code}.json`), { params: Promise.resolve({ key: ["s", "v1", `${made?.code}.json`] }) });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/records/excel", () => {
  it("devuelve un .xlsx con el link corto y el destino de referencia; exige credenciales", async () => {
    const excelRoute = ((await import("@/app/api/records/excel/route")) as { POST: Handler }).POST;
    const [made] = await shorten(["https://menu.example.com/para-el-excel"]);
    const body = { records: [{ area: "Playa", estacion: "", mesa: "B1", subgrupo: "", concepto: "", menuUrl: made?.shortUrl }] };
    const response = await excelRoute(post("/api/records/excel", body), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK"); // un .xlsx es un ZIP
    const book = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets["Piezas"] as XLSX.WorkSheet, { header: 1, defval: "" });
    expect(rows[1]?.[5]).toBe(made?.shortUrl);
    expect(rows[1]?.[7]).toBe("https://menu.example.com/para-el-excel");

    expect((await excelRoute(post("/api/records/excel", body, { authorization: "" }), {})).status).toBe(401);
    expect((await excelRoute(post("/api/records/excel", { records: [] }), {})).status).toBe(400);
  });
});
