import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** POST /api/qr/logo: guardas reales y saneado del SVG del logo. */
const PASSWORD = "una-clave-larga-123";
const AUTH = `Basic ${Buffer.from(`diseno:${PASSWORD}`).toString("base64")}`;
const KEY_SYMBOL = Symbol.for("qr-production-generator.draining");
let dir: string;
type Handler = (request: Request, context: unknown) => Promise<Response>;
let route: Handler;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0L100 0L100 50Z" fill="#274C69"/></svg>`;
const post = (body: BodyInit, extra: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/qr/logo", {
    method: "POST",
    headers: { host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", "content-type": "image/svg+xml", ...extra },
    body,
  });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-logo-"));
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
    LOG_LEVEL: "error",
    RATE_LIMIT_PREVIEW_PER_MIN: "1000",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  route = (await import("@/app/api/qr/logo/route")).POST as Handler;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  (globalThis as Record<symbol, unknown>)[KEY_SYMBOL] = false;
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/qr/logo", () => {
  it("devuelve la geometría saneada del logo", async () => {
    const response = await route(post(SVG), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { geometry: { viewBox: number[]; nodes: Array<{ type: string; fill: string }> } };
    expect(body.geometry.viewBox).toEqual([0, 0, 100, 50]);
    expect(body.geometry.nodes).toEqual([expect.objectContaining({ type: "path", fill: "#274C69" })]);
  });

  it("rechaza con 400 y un mensaje en español un SVG con scripts o elementos no admitidos", async () => {
    const response = await route(post(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>`), {});
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.message).toMatch(/No se pudo usar el SVG/);
  });

  it("400 con un cuerpo vacío y con algo que no es un SVG", async () => {
    expect((await route(post(""), {})).status).toBe(400);
    expect((await route(post("esto no es un svg"), {})).status).toBe(400);
  });

  it("401 sin credenciales, 415 con otro Content-Type y 403 entre sitios", async () => {
    expect((await route(post(SVG, { authorization: "" }), {})).status).toBe(401);
    expect((await route(post(SVG, { "content-type": "application/json" }), {})).status).toBe(415);
    expect((await route(post(SVG, { "sec-fetch-site": "cross-site" }), {})).status).toBe(403);
  });

  it("413 si el cuerpo supera el máximo de un SVG", async () => {
    const huge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${"<!-- x -->".repeat(60_000)}</svg>`;
    expect((await route(post(huge), {})).status).toBe(413);
  });
});
