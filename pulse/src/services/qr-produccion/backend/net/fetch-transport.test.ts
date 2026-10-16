import { describe, expect, it, vi } from "vitest";

import { addressesFromDoh, makeResolver } from "./dns";
import { makeFetchTransport } from "./fetch-transport";
import { SafeFetchError, safeFetch } from "./safe-fetch";

const request = (maxBytes = 100) => ({ url: new URL("https://qr.cliente.com/a.svg"), address: { address: "93.184.216.34", family: 4 as const }, signal: new AbortController().signal, maxBytes });
const streamOf = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
      controller.close();
    },
  });

describe("makeFetchTransport", () => {
  it("pide sin seguir redirecciones, sin compresión, y devuelve estado, cabeceras en minúsculas y cuerpo", async () => {
    const fetchImpl = vi.fn(async () => new Response("<svg/>", { status: 200, headers: { "Content-Type": "image/svg+xml" } }));
    const result = await makeFetchTransport(fetchImpl as unknown as typeof fetch)(request());
    expect(fetchImpl).toHaveBeenCalledWith("https://qr.cliente.com/a.svg", expect.objectContaining({ redirect: "manual", headers: expect.objectContaining({ "accept-encoding": "identity" }) }));
    expect(result).toMatchObject({ status: 200, headers: { "content-type": "image/svg+xml" } });
    expect(new TextDecoder().decode(result.body)).toBe("<svg/>");
  });

  it("deja pasar la respuesta de una redirección (la sigue safeFetch, revalidando)", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://b.com/x" } }));
    expect(await makeFetchTransport(fetchImpl as unknown as typeof fetch)(request())).toMatchObject({ status: 302, headers: { location: "https://b.com/x" } });
  });

  it("corta el cuerpo al pasarse del máximo, aunque no declare Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    await expect(makeFetchTransport(fetchImpl as unknown as typeof fetch)(request(100))).rejects.toMatchObject({ code: "too-large" });
    expect(cancelled).toBe(true);
  });

  it("rechaza por Content-Length declarado sin leer el cuerpo", async () => {
    const fetchImpl = vi.fn(async () => new Response(streamOf("x"), { status: 200, headers: { "content-length": "5000" } }));
    await expect(makeFetchTransport(fetchImpl as unknown as typeof fetch)(request(100))).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("funciona de punta a punta con safeFetch, el resolutor y la política SSRF", async () => {
    const fetchImpl = vi.fn(async (url: string) => (String(url).includes("dns-query") ? Response.json({ Status: 0, Answer: [{ type: 1, data: "169.254.169.254" }] }) : new Response("<svg/>")));
    const deps = { resolve: makeResolver({ fetchImpl: fetchImpl as unknown as typeof fetch }), transport: makeFetchTransport(fetchImpl as unknown as typeof fetch) };
    await expect(safeFetch("https://rebind.cliente.com/a.svg", { policy: { mode: "public" }, timeoutMs: 1000, maxBytes: 100 }, deps)).rejects.toMatchObject({ code: "unsafe-url" });
    expect(fetchImpl.mock.calls.every(([url]) => String(url).includes("dns-query"))).toBe(true); // nunca llegó a conectar con el destino
  });
});

describe("resolutor", () => {
  it("addressesFromDoh quita los CNAME y respeta el estado de error", () => {
    expect(addressesFromDoh({ Status: 0, Answer: [{ type: 5, data: "x.cdn.net." }, { type: 1, data: "93.184.216.34" }, { type: 28, data: "2606:4700::1" }] })).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1", family: 6 },
    ]);
    expect(addressesFromDoh({ Status: 3 })).toEqual([]);
  });

  it("usa el DNS del runtime y, si falla o no existe, DNS-over-HTTPS", async () => {
    const native = makeResolver({ resolveDns: async (_h, type) => (type === "A" ? ["93.184.216.34"] : []) });
    expect(await native("a.com")).toEqual([{ address: "93.184.216.34", family: 4 }]);

    const fetchImpl = vi.fn(async (url: string) => Response.json({ Status: 0, Answer: [{ type: String(url).includes("type=AAAA") ? 28 : 1, data: String(url).includes("type=AAAA") ? "2606:4700::1" : "1.1.1.1" }] }));
    const fallback = makeResolver({
      resolveDns: async () => {
        throw new Error("no soportado");
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await fallback("a.com")).toEqual([
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700::1", family: 6 },
    ]);
  });

  it("si ninguno resuelve, lanza (safeFetch lo informa como inalcanzable)", async () => {
    const resolver = makeResolver({ fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    await expect(resolver("a.com")).rejects.toThrow(/No se pudo resolver/);
  });
});
