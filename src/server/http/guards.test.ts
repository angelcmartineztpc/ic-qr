import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createApiGuards, type GuardConfig } from "./guards";
import { HttpError } from "./errors";
import { RateLimiter } from "./rate-limit";
import { Semaphore } from "./semaphore";

const PASSWORD = "correct horse battery";
const BASIC_OK = `Basic ${Buffer.from(`diseño:${PASSWORD}`).toString("base64")}`;

function config(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return {
    auth: {
      mode: "basic",
      basicUser: "diseño",
      basicPasswordSha256: createHash("sha256").update(PASSWORD).digest("hex"),
    },
    origin: {
      allowedHosts: ["qr.example.com"],
      allowedOrigins: ["https://qr.example.com"],
      trustProxyHops: 0,
    },
    isDraining: () => false,
    logError: vi.fn(),
    newRequestId: () => "req-1",
    ...overrides,
  };
}

function request(init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Request {
  const method = init.method ?? "POST";
  return new Request("https://qr.example.com/api/test", {
    method,
    headers: {
      host: "qr.example.com",
      authorization: BASIC_OK,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...init.headers,
    },
    ...(method === "GET" ? {} : { body: init.body ?? "{}" }),
  });
}

const ok = async () => Response.json({ ok: true });

async function code(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe("withApiGuards", () => {
  const guards = createApiGuards(config());
  const route = guards(ok, { contentTypes: ["application/json"] });

  it("deja pasar una petición correcta y añade X-Request-Id", async () => {
    const response = await route(request(), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-1");
  });

  it("421 si el Host no está permitido (anti DNS-rebinding)", async () => {
    const response = await route(request({ headers: { host: "evil.example" } }), {});
    expect(response.status).toBe(421);
    expect(await code(response)).toBe("MISDIRECTED_HOST");
  });

  it("401 con desafío Basic si faltan credenciales o son incorrectas", async () => {
    const missing = await route(request({ headers: { authorization: "" } }), {});
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Basic");

    const wrong = `Basic ${Buffer.from("diseño:otra").toString("base64")}`;
    expect((await route(request({ headers: { authorization: wrong } }), {})).status).toBe(401);
  });

  it("415 con Content-Type text/plain (evita el CSRF sin preflight)", async () => {
    const response = await route(request({ headers: { "content-type": "text/plain" } }), {});
    expect(response.status).toBe(415);
  });

  it("403 con Sec-Fetch-Site cross-site o un Origin ajeno", async () => {
    expect((await route(request({ headers: { "sec-fetch-site": "cross-site" } }), {})).status).toBe(403);

    const foreignOrigin = request({ headers: { "sec-fetch-site": "", origin: "https://evil.example" } });
    expect((await route(foreignOrigin, {})).status).toBe(403);

    const allowedOrigin = request({ headers: { "sec-fetch-site": "", origin: "https://qr.example.com" } });
    expect((await route(allowedOrigin, {})).status).toBe(200);
  });

  it("no exige mismo origen en GET salvo que se pida", async () => {
    const get = guards(ok);
    expect((await get(request({ method: "GET", headers: { "sec-fetch-site": "cross-site" } }), {})).status).toBe(200);
  });

  it("429 con Retry-After cuando se agota el rate limit", async () => {
    const limited = guards(ok, { rateLimit: new RateLimiter(1, 1, () => 0) });
    expect((await limited(request(), {})).status).toBe(200);
    const second = await limited(request(), {});
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
  });

  it("429 sin leer el cuerpo cuando el semáforo está lleno, y libera al terminar", async () => {
    const semaphore = new Semaphore(1);
    const hold = semaphore.tryAcquire();
    const handler = vi.fn(ok);
    const busy = guards(handler, { semaphore });

    const response = await busy(request(), {});
    expect(response.status).toBe(429);
    expect(await code(response)).toBe("BUSY");
    expect(handler).not.toHaveBeenCalled();

    hold?.();
    expect((await busy(request(), {})).status).toBe(200);
    expect(semaphore.inUse).toBe(0);
  });

  it("mantiene el semáforo ocupado si el manejador difiere la liberación (streaming)", async () => {
    const semaphore = new Semaphore(1);
    let release: (() => void) | undefined;
    const streaming = guards(async (ctx) => {
      release = ctx.deferRelease();
      return new Response("stream");
    }, { semaphore });

    await streaming(request(), {});
    expect(semaphore.inUse).toBe(1);
    release?.();
    expect(semaphore.inUse).toBe(0);
  });

  it("413 por Content-Length declarado y por cuerpo real excesivo", async () => {
    const small = guards(async (ctx) => Response.json(await ctx.readJson()), { maxBody: 8 });
    const declared = await small(request({ headers: { "content-length": "100" } }), {});
    expect(declared.status).toBe(413);

    const real = await small(request({ body: JSON.stringify({ a: "x".repeat(50) }) }), {});
    expect(real.status).toBe(413);
  });

  it("400 si el cuerpo no es JSON", async () => {
    const parse = guards(async (ctx) => Response.json(await ctx.readJson()));
    const response = await parse(request({ body: "{nope" }), {});
    expect(response.status).toBe(400);
  });

  it("503 durante el apagado ordenado en rutas marcadas", async () => {
    const draining = createApiGuards(config({ isDraining: () => true }));
    expect((await draining(ok, { rejectWhenDraining: true })(request(), {})).status).toBe(503);
    expect((await draining(ok)(request(), {})).status).toBe(200);
  });

  it("convierte HttpError en su respuesta y oculta errores inesperados", async () => {
    const logError = vi.fn();
    const failing = createApiGuards(config({ logError }));

    const known = await failing(async () => {
      throw new HttpError(422, "VALIDATION_FAILED", "Datos inválidos", { field: "menuUrl" });
    })(request(), {});
    expect(known.status).toBe(422);
    expect(await known.json()).toMatchObject({ code: "VALIDATION_FAILED", details: { field: "menuUrl" } });

    const unknown = await failing(async () => {
      throw new Error("secreto interno");
    })(request(), {});
    expect(unknown.status).toBe(500);
    const body = await unknown.text();
    expect(body).not.toContain("secreto interno");
    expect(logError).toHaveBeenCalledOnce();
  });

  it("AUTH_MODE=proxy exige el secreto compartido", async () => {
    const proxied = createApiGuards(config({ auth: { mode: "proxy", proxySecret: "s".repeat(32) } }))(ok);
    expect((await proxied(request({ headers: { authorization: "" } }), {})).status).toBe(401);
    const response = await proxied(request({ headers: { "x-proxy-auth": "s".repeat(32) } }), {});
    expect(response.status).toBe(200);
  });

  it("solo usa X-Forwarded-Host con saltos de proxy de confianza", async () => {
    const behindProxy = createApiGuards(
      config({ origin: { allowedHosts: ["qr.example.com"], allowedOrigins: [], trustProxyHops: 1 } }),
    )(ok);
    const forwarded = request({ headers: { host: "10.0.0.5:3000", "x-forwarded-host": "qr.example.com" } });
    expect((await behindProxy(forwarded, {})).status).toBe(200);

    const direct = await route(request({ headers: { host: "evil.example", "x-forwarded-host": "qr.example.com" } }), {});
    expect(direct.status).toBe(421);
  });
});
