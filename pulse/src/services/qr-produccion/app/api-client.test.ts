import { describe, expect, it, vi } from "vitest";

import { ApiError, authedFetch, describeHttpFailure, errorFromResponse, functionsBase, postJson } from "./api-client";

const session = { access_token: "aaa.bbb.ccc" };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session } }) } } }));

describe("functionsBase", () => {
  it("usa la URL del proyecto, o la que se configure para las funciones", () => {
    expect(functionsBase({ VITE_SUPABASE_URL: "https://abc.supabase.co" })).toBe("https://abc.supabase.co/functions/v1");
    expect(functionsBase({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_QR_FUNCTIONS_URL: "https://api.palace.com/qr/" })).toBe("https://api.palace.com/qr");
  });
});

describe("authedFetch", () => {
  it("sin proyecto de Supabase configurado no toca la petición (ni espera la sesión)", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const init = { method: "POST", headers: { "X-Import-Truncate": "5" } };
    await authedFetch("https://f.test/x", init);
    expect(spy).toHaveBeenCalledWith("https://f.test/x", init);
    spy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("añade el JWT de la sesión sin pisar el resto de cabeceras (ni su capitalización)", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await authedFetch("https://f.test/x", { method: "POST", headers: { "Content-Type": "application/json", "X-Import-Truncate": "5" } });
    expect((spy.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ "Content-Type": "application/json", "X-Import-Truncate": "5", Authorization: "Bearer aaa.bbb.ccc" });
    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("errores HTTP en español", () => {
  it("el mensaje de la función (con su referencia) se muestra tal cual", () => {
    expect(describeHttpFailure(400, { code: "VALIDATION_FAILED", message: "Petición no válida", requestId: "r-1" })).toBe("Petición no válida");
  });

  it("los de la plataforma (sin referencia) se explican: límite de recursos, tiempo agotado o función sin desplegar", () => {
    expect(describeHttpFailure(546, { code: "WORKER_LIMIT", message: "Function failed due to not having enough compute resources" })).toMatch(/más recursos.*menos piezas/);
    expect(describeHttpFailure(504, {})).toMatch(/tardó demasiado/);
    expect(describeHttpFailure(404, { code: "NOT_FOUND", message: "Requested function was not found" })).toMatch(/desplegada/);
    expect(describeHttpFailure(418, {})).toBe("El servidor respondió 418");
  });

  it("errorFromResponse conserva código, estado y referencia", async () => {
    const error = await errorFromResponse(Response.json({ code: "RATE_LIMITED", message: "Demasiadas solicitudes", requestId: "r-9" }, { status: 429 }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", message: "Demasiadas solicitudes", requestId: "r-9" });
    expect(await errorFromResponse(new Response("<html>", { status: 502 }))).toMatchObject({ status: 502, code: "HTTP_ERROR", message: "El servidor respondió 502" });
  });

  it("postJson envía JSON y lanza ApiError con el mensaje del servidor", async () => {
    const ok = vi.fn(async () => Response.json({ a: 1 }));
    expect(await postJson("https://f.test/x", { q: 1 }, undefined, ok as unknown as typeof fetch)).toEqual({ a: 1 });
    expect(ok).toHaveBeenCalledWith("https://f.test/x", expect.objectContaining({ method: "POST", body: '{"q":1}' }));
    const failing = async () => Response.json({ code: "UNAUTHORIZED", message: "Inicia sesión", requestId: "r" }, { status: 401 });
    await expect(postJson("https://f.test/x", {}, undefined, failing as unknown as typeof fetch)).rejects.toMatchObject({ status: 401, message: "Inicia sesión" });
  });
});
