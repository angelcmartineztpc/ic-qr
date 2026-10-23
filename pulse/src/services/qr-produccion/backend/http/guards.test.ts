import { describe, expect, it } from "vitest";

import { HttpError } from "./errors";
import { createGuards, type GuardConfig } from "./guards";
import { perMinute } from "./rate-limit";
import { Semaphore } from "./semaphore";

interface Principal {
  userId: string;
}

function setup(overrides: Partial<GuardConfig<Principal>> = {}) {
  const errors: string[] = [];
  const config: GuardConfig<Principal> = {
    authenticate: async (request) => {
      if (request.headers.get("authorization") !== "Bearer ok") throw new HttpError(request.headers.has("authorization") ? 403 : 401, request.headers.has("authorization") ? "FORBIDDEN" : "UNAUTHORIZED", "sin acceso");
      return { userId: "u1" };
    },
    allowedOrigins: [],
    logError: (message) => errors.push(message),
    newRequestId: () => "req-1",
    ...overrides,
  };
  return { guarded: createGuards(config), errors };
}

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://f.test/x", { method: "POST", headers: { authorization: "Bearer ok", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("createGuards", () => {
  it("responde el preflight CORS sin autenticar", async () => {
    const { guarded } = setup();
    const response = await guarded(async () => new Response("no"))(new Request("https://f.test/x", { method: "OPTIONS", headers: { origin: "https://pulse.test" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("401 sin sesión y 403 con sesión sin rol; las dos con CORS y referencia", async () => {
    const { guarded } = setup();
    const route = guarded(async () => Response.json({ ok: true }), { contentTypes: ["application/json"] });
    const anon = await route(new Request("https://f.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(anon.status).toBe(401);
    expect(await anon.json()).toMatchObject({ code: "UNAUTHORIZED", requestId: "req-1" });
    expect(anon.headers.get("access-control-allow-origin")).toBe("*");
    const noRole = await route(post({}, { authorization: "Bearer otro" }));
    expect(noRole.status).toBe(403);
  });

  it("415 si el Content-Type no es el esperado, 405 si el método no está permitido", async () => {
    const { guarded } = setup();
    const route = guarded(async () => Response.json({}), { contentTypes: ["application/json"] });
    expect((await route(post({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await route(new Request("https://f.test/x", { method: "DELETE", headers: { authorization: "Bearer ok" } }))).status).toBe(405);
  });

  it("413 por Content-Length y por cuerpo mayor que el límite aunque no lo declare", async () => {
    const { guarded } = setup();
    const route = guarded(async (ctx) => Response.json(await ctx.readJson()), { contentTypes: ["application/json"], maxBody: 20 });
    expect((await route(post({ a: "x".repeat(100) }, { "content-length": "200" }))).status).toBe(413);
    expect((await route(post({ a: "x".repeat(100) }))).status).toBe(413);
    expect((await route(post({ a: 1 }))).status).toBe(200);
  });

  it("limita el uso por usuario (429 con Retry-After)", async () => {
    const { guarded } = setup();
    const route = guarded(async () => Response.json({}), { rateLimit: perMinute(1) });
    const get = () => route(new Request("https://f.test/x", { headers: { authorization: "Bearer ok" } }));
    expect((await get()).status).toBe(200);
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("el semáforo rechaza sin cola y se libera al terminar (o al diferirlo, cuando lo decide el manejador)", async () => {
    const { guarded } = setup();
    const semaphore = new Semaphore(1);
    let finish = () => {};
    const slow = guarded(
      async (ctx) => {
        const release = ctx.deferRelease();
        finish = release;
        return new Response("stream");
      },
      { semaphore },
    );
    const request = () => new Request("https://f.test/x", { headers: { authorization: "Bearer ok" } });
    expect((await slow(request())).status).toBe(200);
    expect((await slow(request())).status).toBe(429); // sigue ocupado: el stream no terminó
    finish();
    expect((await slow(request())).status).toBe(200);
  });

  it("un error inesperado es 500 con referencia y sin filtrar el detalle; un HttpError conserva su código", async () => {
    const { guarded, errors } = setup();
    const boom = await guarded(async () => {
      throw new Error("secreto interno");
    })(new Request("https://f.test/x", { headers: { authorization: "Bearer ok" } }));
    expect(boom.status).toBe(500);
    const body = (await boom.json()) as { message: string };
    expect(body.message).toContain("req-1");
    expect(body.message).not.toContain("secreto");
    expect(errors).toHaveLength(1);
    const bad = await guarded(async () => {
      throw new HttpError(400, "VALIDATION_FAILED", "no válido", [{ path: "a" }]);
    })(new Request("https://f.test/x", { headers: { authorization: "Bearer ok" } }));
    expect(await bad.json()).toMatchObject({ code: "VALIDATION_FAILED", details: [{ path: "a" }] });
  });

  it("las rutas públicas no piden sesión", async () => {
    const { guarded } = setup();
    const response = await guarded(async (ctx) => Response.json({ principal: ctx.principal }), { auth: false })(new Request("https://f.test/x"));
    expect(await response.json()).toEqual({ principal: null });
  });
});
