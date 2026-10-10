import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { contentHashOf } from "@/server/qr/hash";

/**
 * Rutas reales llamadas directamente, con las guardas activas y storage local
 * en un directorio temporal. Cada bloque carga los módulos con su entorno.
 */
const PASSWORD = "una-clave-larga-123";
const AUTH = `Basic ${Buffer.from(`diseno:${PASSWORD}`).toString("base64")}`;
const MENU = "https://menu.example.com/tropical";
let dir: string;

type Handler = (request: Request, context: unknown) => Promise<Response>;
interface Routes {
  resolve: Handler;
  asset: Handler;
  storage: Handler;
}

async function load(env: Record<string, string>): Promise<Routes> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [resolve, asset, storage] = await Promise.all([
    import("@/app/api/qr/resolve/route"),
    import("@/app/api/qr/asset/route"),
    import("@/app/api/storage/[...key]/route"),
  ]);
  return { resolve: resolve.POST as Handler, asset: asset.GET as Handler, storage: storage.GET as Handler };
}

const baseEnv = (): Record<string, string> => ({
  AUTH_MODE: "basic",
  BASIC_AUTH_USER: "diseno",
  BASIC_AUTH_PASSWORD_SHA256: createHash("sha256").update(PASSWORD).digest("hex"),
  APP_ORIGINS: "http://localhost:3000",
  APP_ALLOWED_HOSTS: "localhost:3000",
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_DIR: dir,
  STORAGE_PUBLIC_BASE_URL: "http://localhost:3000/api/storage",
  LOG_LEVEL: "error",
});

const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", "content-type": "application/json", ...extra });
const post = (body: unknown, extra: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/qr/resolve", { method: "POST", headers: headers(extra), body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string, extra: Record<string, string> = {}) => new Request(`http://localhost:3000${path}`, { headers: { host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", ...extra } });
const item = (recordId: string, menuUrl = MENU) => ({ recordId, menuUrl, expectedRevision: 0 });
interface Body {
  created: number;
  reused: number;
  failed: number;
  code?: string;
  viewBox?: number[];
  strokeBased?: boolean;
  results: Array<{ recordId: string; outcome: string; qrUrl?: string; qr?: { snapshotKey?: string } & Record<string, unknown>; error?: { code: string } }>;
}
const json = async (response: Response) => (await response.json()) as Body;
const svgFiles = async () => (await readdir(join(dir, "qr", "v1")).catch(() => [])).filter((f) => f.endsWith(".svg"));

let routes: Routes;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-api-"));
  routes = await load(baseEnv());
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/qr/resolve — guardas", () => {
  it("401 sin credenciales, 415 con otro Content-Type, 403 cross-site, 421 con otro Host", async () => {
    expect((await routes.resolve(post({ items: [item("r1")] }, { authorization: "" }), {})).status).toBe(401);
    expect((await routes.resolve(post({ items: [item("r1")] }, { "content-type": "text/plain" }), {})).status).toBe(415);
    expect((await routes.resolve(post({ items: [item("r1")] }, { "sec-fetch-site": "cross-site" }), {})).status).toBe(403);
    expect((await routes.resolve(post({ items: [item("r1")] }, { host: "evil.example" }), {})).status).toBe(421);
    expect(await svgFiles()).toEqual([]); // ninguna petición rechazada escribió nada
  });

  it("400 con detalle si la petición no es válida, está vacía o supera el lote máximo", async () => {
    const empty = await routes.resolve(post({ items: [] }), {});
    expect(empty.status).toBe(400);
    expect((await json(empty)).code).toBe("VALIDATION_FAILED");
    expect((await routes.resolve(post("{no es json"), {})).status).toBe(400);
    expect((await routes.resolve(post({ items: Array.from({ length: 101 }, (_, i) => item(`r${i}`)) }), {})).status).toBe(400);
    expect((await routes.resolve(post({ items: [item("r1")], extra: true }), {})).status).toBe(400);
  });
});

describe("POST /api/qr/resolve — generar, reutilizar y verificar", () => {
  it("sin Link del QR: genera, guarda el SVG y devuelve la URL pública derivada (AC13–AC16)", async () => {
    const response = await routes.resolve(post({ items: [item("r1")] }), {});
    expect(response.status).toBe(200);
    const body = await json(response);
    const key = `qr/v1/${contentHashOf(MENU)}.svg`;
    expect(body).toMatchObject({ created: 1, reused: 0, failed: 0 });
    expect(body.results[0]).toMatchObject({ recordId: "r1", outcome: "generated", qrUrl: `http://localhost:3000/api/storage/${key}`, qr: { source: "generated", storageKey: key, payload: MENU } });
    expect(await svgFiles()).toEqual([`${contentHashOf(MENU)}.svg`]);
  });

  it("repetir la llamada reutiliza: no crea archivos nuevos", async () => {
    const response = await routes.resolve(post({ items: [item("r1"), item("r2")] }), {});
    expect(await json(response)).toMatchObject({ created: 0, reused: 2, failed: 0 });
    expect(await svgFiles()).toHaveLength(1);
  });

  it("REGLA CRÍTICA: un ítem con Link del QR no genera nada, ni siquiera por la API", async () => {
    const before = await svgFiles();
    const response = await routes.resolve(post({ items: [{ ...item("r9", "https://menu.example.com/otro"), qrUrl: "https://qr.cliente.com/m9.svg" }] }), {});
    const body = await json(response);
    expect(body.results[0]).toMatchObject({ outcome: "failed", error: { code: "unsafe-url" } });
    expect(await svgFiles()).toEqual(before);
  });

  it("verify: un QR de nuestro propio storage se lee sin red y se decodifica; se guarda la instantánea", async () => {
    const url = `http://localhost:3000/api/storage/qr/v1/${contentHashOf(MENU)}.svg`;
    const response = await routes.resolve(post({ verify: [{ recordId: "r5", qrUrl: url, menuUrl: MENU }] }), {});
    const body = await json(response);
    expect(body.results[0]).toMatchObject({ recordId: "r5", outcome: "existing-ok", qr: { source: "existing", verification: "decoded", decodedPayload: MENU } });
    expect(await svgFiles()).toHaveLength(1); // verificar no crea ningún QR
  });

  it("verify: una URL no https o a una IP privada falla con un error claro y sin generar", async () => {
    const response = await routes.resolve(
      post({ verify: [
        { recordId: "a", qrUrl: "http://qr.cliente.com/x.svg", menuUrl: MENU },
        { recordId: "b", qrUrl: "https://169.254.169.254/latest/meta-data/", menuUrl: MENU },
        { recordId: "c", qrUrl: "javascript:alert(1)", menuUrl: MENU },
      ] }),
      {},
    );
    const body = await json(response);
    expect(body.results.map((r) => [r.outcome, r.error?.code])).toEqual([["failed", "unsafe-url"], ["failed", "unsafe-url"], ["failed", "unsafe-url"]]);
    expect(body.failed).toBe(3);
    expect(await svgFiles()).toHaveLength(1);
  });
});

describe("GET /api/storage/[...key] — archivos públicos del storage local", () => {
  const key = () => `qr/v1/${contentHashOf(MENU)}.svg`;
  const ctx = (path: string) => ({ params: Promise.resolve({ key: path.split("/") }) });

  it("sirve el SVG sin autenticación, con cabeceras de archivo inmutable e inofensivo", async () => {
    const request = new Request(`http://localhost:3000/api/storage/${key()}`, { headers: { host: "localhost:3000" } });
    const response = await routes.storage(request, ctx(key()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(await response.text()).toMatch(/^<svg /);
  });

  it("304 con If-None-Match", async () => {
    const first = await routes.storage(new Request(`http://localhost:3000/api/storage/${key()}`), ctx(key()));
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const second = await routes.storage(new Request(`http://localhost:3000/api/storage/${key()}`, { headers: { "if-none-match": etag } }), ctx(key()));
    expect(second.status).toBe(304);
  });

  it.each(["../../etc/passwd", "qr/v1/../../x.svg", `qr/v1/${"a".repeat(64)}.png`, "otra/cosa.svg", `qr/v1/${"a".repeat(64)}.svg`])("404 para %s", async (path) => {
    expect((await routes.storage(new Request(`http://localhost:3000/api/storage/${path}`), ctx(path))).status).toBe(404);
  });

  it("con un proveedor S3 la ruta no existe (404): sirve el bucket", async () => {
    const s3Routes = await load({ ...baseEnv(), STORAGE_PROVIDER: "s3", STORAGE_BUCKET: "qr", STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com", STORAGE_ENDPOINT: "http://127.0.0.1:1" });
    expect((await s3Routes.storage(new Request(`http://localhost:3000/api/storage/${key()}`), ctx(key()))).status).toBe(404);
    routes = await load(baseEnv());
  });
});

describe("GET /api/qr/asset — geometría saneada para la vista previa", () => {
  async function snapshotKey(): Promise<string> {
    const url = `http://localhost:3000/api/storage/qr/v1/${contentHashOf(MENU)}.svg`;
    const body = await json(await routes.resolve(post({ verify: [{ recordId: "r5", qrUrl: url, menuUrl: MENU }] }), {}));
    return body.results[0]?.qr?.snapshotKey ?? "";
  }

  it("devuelve la geometría de la instantánea (privada y cacheable 1 h)", async () => {
    const key = await snapshotKey();
    const response = await routes.asset(get(`/api/qr/asset?key=${encodeURIComponent(key)}`), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await json(response)).toMatchObject({ viewBox: [0, 0, 41, 41], strokeBased: false });
  });

  it("400 con claves que no son de instantánea (un QR generado, rutas, vacío) y 404 si no existe", async () => {
    for (const bad of [`qr/v1/${contentHashOf(MENU)}.svg`, "../x.json", "", "qr/ext/v1/zz.json"]) {
      expect((await routes.asset(get(`/api/qr/asset?key=${encodeURIComponent(bad)}`), {})).status, bad).toBe(400);
    }
    expect((await routes.asset(get(`/api/qr/asset?key=qr%2Fext%2Fv1%2F${"c".repeat(64)}.json`), {})).status).toBe(404);
  });

  it("exige autenticación y mismo origen", async () => {
    const key = encodeURIComponent(await snapshotKey());
    expect((await routes.asset(get(`/api/qr/asset?key=${key}`, { authorization: "" }), {})).status).toBe(401);
    expect((await routes.asset(get(`/api/qr/asset?key=${key}`, { "sec-fetch-site": "cross-site" }), {})).status).toBe(403);
  });
});
