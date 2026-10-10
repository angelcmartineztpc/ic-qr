import { describe, expect, it, vi } from "vitest";

import { isPublicAddress } from "./is-public-address";
import { safeFetch, SafeFetchError, type ResolvedAddress, type SafeFetchDeps, type SafeFetchOptions, type TransportRequest } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"])("pública: %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.255",
    "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "0.0.0.0", "255.255.255.255", "224.0.0.1", "240.0.0.1",
    "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "192.0.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd00::1", "fd00:ec2::254", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::1", "2002:a9fe:a9fe::1", "2001::1",
    "no es una ip", "", "999.1.1.1", "[::1]",
  ])("NO pública: %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("acepta IPv6 entre corchetes", () => {
    expect(isPublicAddress("[2606:4700:4700::1111]")).toBe(true);
  });
});

const OPTIONS: SafeFetchOptions = { policy: { mode: "public" }, timeoutMs: 5000, maxBytes: 1000 };
const ok = (body = "<svg/>", headers: Record<string, string> = { "content-type": "image/svg+xml" }) => ({ status: 200, headers, body: new TextEncoder().encode(body) });

function deps(table: Record<string, string[]>, responder: (request: TransportRequest) => Promise<ReturnType<typeof ok> | { status: number; headers: Record<string, string>; body: Uint8Array }>) {
  const calls: TransportRequest[] = [];
  const resolve = vi.fn(async (host: string): Promise<ResolvedAddress[]> => {
    const addresses = table[host];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  });
  const transport: SafeFetchDeps["transport"] = async (request) => {
    calls.push(request);
    return responder(request);
  };
  return { deps: { resolve, transport } satisfies SafeFetchDeps, calls, resolve };
}

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeFetchError) return error.code;
    throw error;
  }
  return "no falló";
};

describe("safeFetch — matriz SSRF (spec §31)", () => {
  it("descarga un recurso público y conecta a la IP ya validada", async () => {
    const { deps: d, calls } = deps({ "qr.cliente.com": ["93.184.216.34"] }, async () => ok());
    const result = await safeFetch("https://qr.cliente.com/m1.svg", OPTIONS, d);
    expect(new TextDecoder().decode(result.bytes)).toBe("<svg/>");
    expect(result.contentType).toBe("image/svg+xml");
    expect(calls[0]?.address).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it.each([
    ["http://qr.cliente.com/m1.svg", "unsafe-url"],
    ["ftp://qr.cliente.com/m1.svg", "unsafe-url"],
    ["file:///etc/passwd", "unsafe-url"],
    ["javascript:alert(1)", "unsafe-url"],
    ["data:image/svg+xml,<svg/>", "unsafe-url"],
    ["https://qr.cliente.com:8443/m1.svg", "unsafe-url"],
    ["https://user:pass@qr.cliente.com/m1.svg", "unsafe-url"],
    ["no es una url", "unsafe-url"],
  ])("rechaza %s", async (url, code) => {
    const { deps: d, calls } = deps({ "qr.cliente.com": ["93.184.216.34"] }, async () => ok());
    expect(await failure(safeFetch(url, OPTIONS, d))).toBe(code);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["https://127.0.0.1/q.svg"],
    ["https://169.254.169.254/latest/meta-data/"],
    ["https://[::1]/q.svg"],
    ["https://[::ffff:127.0.0.1]/q.svg"],
    ["https://10.1.2.3/q.svg"],
    ["https://0x7f.1/q.svg"],
    ["https://2130706433/q.svg"],
    ["https://localhost/q.svg"],
  ])("bloquea el destino privado %s sin conectar", async (url) => {
    const { deps: d, calls } = deps({ localhost: ["127.0.0.1", "::1"] }, async () => ok());
    expect(await failure(safeFetch(url, OPTIONS, d))).toBe("unsafe-url");
    expect(calls).toHaveLength(0);
  });

  it("bloquea un nombre que resuelve a una IP privada y basta UNA privada entre varias", async () => {
    const { deps: d, calls } = deps({ "interno.cliente.com": ["10.0.0.5"], "mixto.cliente.com": ["93.184.216.34", "192.168.1.9"], "meta.cliente.com": ["169.254.169.254"] }, async () => ok());
    for (const host of ["interno", "mixto", "meta"]) expect(await failure(safeFetch(`https://${host}.cliente.com/q.svg`, OPTIONS, d))).toBe("unsafe-url");
    expect(calls).toHaveLength(0);
  });

  it("DNS rebinding: se conecta a la IP validada, aunque el nombre cambie después", async () => {
    let answers = 0;
    const calls: TransportRequest[] = [];
    const d: SafeFetchDeps = {
      resolve: async () => (answers++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]),
      transport: async (request) => (calls.push(request), ok()),
    };
    await safeFetch("https://rebind.cliente.com/q.svg", OPTIONS, d);
    expect(calls[0]?.address.address).toBe("93.184.216.34");
  });

  it("host sin DNS → unreachable", async () => {
    const { deps: d } = deps({}, async () => ok());
    expect(await failure(safeFetch("https://no-existe.cliente.com/q.svg", OPTIONS, d))).toBe("unreachable");
  });

  describe("redirecciones", () => {
    const redirect = (to: string) => ({ status: 302, headers: { location: to }, body: new Uint8Array() });

    it("las sigue (≤3) y revalida cada destino", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"], "b.com": ["93.184.216.35"] }, async ({ url }) => (url.hostname === "a.com" ? redirect("https://b.com/final.svg") : ok("<svg>final</svg>")));
      const result = await safeFetch("https://a.com/x.svg", OPTIONS, d);
      expect(result.finalUrl).toBe("https://b.com/final.svg");
    });

    it("una redirección hacia una IP privada, al servicio de metadatos o a http se bloquea", async () => {
      for (const target of ["https://169.254.169.254/latest/meta-data/", "https://127.0.0.1/", "http://b.com/x.svg", "https://interno.com/x.svg"]) {
        const { deps: d } = deps({ "a.com": ["93.184.216.34"], "b.com": ["93.184.216.35"], "interno.com": ["10.0.0.1"] }, async ({ url }) => (url.hostname === "a.com" ? redirect(target) : ok()));
        expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d)), target).toBe("unsafe-url");
      }
    });

    it("más de 3 redirecciones, o un bucle, se corta", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, async () => redirect("https://a.com/otra"));
      expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d))).toBe("unsafe-url");
    });

    it("redirección sin Location → unreachable", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, async () => ({ status: 301, headers: {}, body: new Uint8Array() }));
      expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d))).toBe("unreachable");
    });
  });

  describe("límites", () => {
    it("4xx y 5xx → unreachable", async () => {
      for (const status of [403, 404, 500, 503]) {
        const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, async () => ({ status, headers: {}, body: new Uint8Array() }));
        expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d))).toBe("unreachable");
      }
    });

    it("cuerpo mayor que el máximo → too-large", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, async () => ok("x".repeat(1001)));
      expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d))).toBe("too-large");
    });

    it("tiempo agotado → timeout", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })))));
      expect(await failure(safeFetch("https://a.com/x.svg", { ...OPTIONS, timeoutMs: 30 }, d))).toBe("timeout");
    });

    it("un fallo de red del transporte → unreachable", async () => {
      const { deps: d } = deps({ "a.com": ["93.184.216.34"] }, async () => {
        throw new Error("ECONNRESET");
      });
      expect(await failure(safeFetch("https://a.com/x.svg", OPTIONS, d))).toBe("unreachable");
    });
  });

  describe("política de hosts", () => {
    const allow = { ...OPTIONS, policy: { mode: "allowlist", hosts: ["qr.cliente.com", ".cdn.cliente.com"] } } as const;

    it("allowlist: solo los hosts listados (y subdominios con punto inicial)", async () => {
      const { deps: d } = deps({ "qr.cliente.com": ["93.184.216.34"], "img.cdn.cliente.com": ["93.184.216.35"], "otro.com": ["93.184.216.36"], "evilcdn.cliente.com": ["93.184.216.37"] }, async () => ok());
      await expect(safeFetch("https://qr.cliente.com/a.svg", allow, d)).resolves.toBeDefined();
      await expect(safeFetch("https://img.cdn.cliente.com/a.svg", allow, d)).resolves.toBeDefined();
      expect(await failure(safeFetch("https://otro.com/a.svg", allow, d))).toBe("host-not-allowed");
      expect(await failure(safeFetch("https://evilcdn.cliente.com/a.svg", allow, d))).toBe("host-not-allowed");
    });

    it("una redirección fuera de la lista también se bloquea", async () => {
      const { deps: d } = deps({ "qr.cliente.com": ["93.184.216.34"], "otro.com": ["93.184.216.36"] }, async ({ url }) => (url.hostname === "qr.cliente.com" ? { status: 301, headers: { location: "https://otro.com/a.svg" }, body: new Uint8Array() } : ok()));
      expect(await failure(safeFetch("https://qr.cliente.com/a.svg", allow, d))).toBe("host-not-allowed");
    });

    it("con política pública cualquier host https con IP pública es válido", async () => {
      const { deps: d } = deps({ "cualquiera.org": ["93.184.216.40"] }, async () => ok());
      await expect(safeFetch("https://cualquiera.org/a.svg", OPTIONS, d)).resolves.toBeDefined();
    });
  });
});
