import { describe, expect, it } from "vitest";

import { probeUrl, type ProbeDeps } from "./probe-url";

const PUBLIC = [{ address: "93.184.216.34", family: 4 as const }];

/** Servidor simulado: ruta → respuesta. */
const fake = (routes: Record<string, { status: number; location?: string }>, resolve: ProbeDeps["resolve"] = async () => PUBLIC): ProbeDeps => ({
  resolve,
  request: async ({ url, method }) => {
    const r = routes[url.pathname];
    if (!r || (method === "HEAD" && url.pathname === "/no-head")) return { status: url.pathname === "/no-head" ? 405 : 404 };
    return r;
  },
});

describe("probeUrl", () => {
  it("clasifica correcto, redirección al mismo sitio, otro dominio, roto y bucle", async () => {
    const deps = fake({ "/ok": { status: 200 }, "/r": { status: 302, location: "/ok" }, "/x": { status: 301, location: "https://otro.com/ok" }, "/a": { status: 302, location: "/b" }, "/b": { status: 302, location: "/a" }, "/no-head": { status: 200 } });
    const status = async (p: string) => (await probeUrl(`https://sitio.com${p}`, deps)).status;
    expect(await status("/ok")).toBe("ok");
    expect(await status("/r")).toBe("ok");
    expect(await status("/x")).toBe("redirect");
    expect(await status("/missing")).toBe("broken");
    expect(await status("/a")).toBe("redirect_error");
    expect(await status("/no-head")).toBe("ok"); // HEAD no soportado → GET
  });

  it("rechaza lo que no es URL web y no sale a direcciones privadas", async () => {
    expect((await probeUrl("hola mundo", fake({}))).status).toBe("invalid_url");
    expect((await probeUrl("https://x.com:8443/", fake({}))).status).toBe("invalid_url");
    let called = false;
    const spy: ProbeDeps = { resolve: async () => [{ address: "10.0.0.5", family: 4 }], request: async () => ((called = true), { status: 200 }) };
    expect((await probeUrl("https://interno.local/", spy)).status).toBe("connection_error");
    expect((await probeUrl("http://169.254.169.254/latest", spy)).status).toBe("connection_error");
    expect(called).toBe(false);
  });

  it("distingue DNS inexistente y tiempo agotado", async () => {
    expect((await probeUrl("https://nope.invalid/", fake({}, async () => Promise.reject(new Error("ENOTFOUND"))))).status).toBe("connection_error");
    const slow: ProbeDeps = { resolve: async () => PUBLIC, request: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abort")))) };
    // ponytail: espera real de 10 s; si molesta, inyectar el timeout.
    expect((await probeUrl("https://lento.com/", slow)).status).toBe("timeout");
  }, 15_000);
});
