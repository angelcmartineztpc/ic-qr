import { describe, expect, it, vi } from "vitest";

import { MemoryLinksTable } from "../test-helpers/memory-links";
import { DbShortLinkRepository } from "./db-repository";
import { RedirectCache } from "./redirect-cache";
import { redirectResponse, resolveRedirect } from "./redirect";
import { shortenUrls } from "./service";

const BASE = "https://qr.example.com";

async function setup() {
  const repo = new DbShortLinkRepository(new MemoryLinksTable());
  const deps = { repo, base: BASE, ownHosts: ["qr.example.com"], now: () => "2026-10-14T12:00:00.000Z" };
  const [made] = await shortenUrls(["https://menu.example.com/carta"], deps);
  return { repo, code: made?.code ?? "" };
}

describe("resolveRedirect", () => {
  it("302 al destino vigente, sin caché del navegador ni referrer; el código se acepta en mayúsculas", async () => {
    const { repo, code } = await setup();
    const outcome = await resolveRedirect(code.toUpperCase(), { repo, cache: new RedirectCache() });
    expect(outcome).toEqual({ status: 302, location: "https://menu.example.com/carta" });
    const response = redirectResponse(outcome);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://menu.example.com/carta");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("un código mal formado o inexistente es 404 y no toca la base de datos si está mal formado", async () => {
    const { repo } = await setup();
    const get = vi.spyOn(repo, "get");
    expect((await resolveRedirect("../etc/passwd", { repo, cache: new RedirectCache() })).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    expect((await resolveRedirect("zzzzzzzz", { repo, cache: new RedirectCache() })).status).toBe(404);
  });

  it("cada escaneo no es una lectura: el destino se cachea unos segundos y un cambio se propaga al vaciar la caché", async () => {
    const { repo, code } = await setup();
    const cache = new RedirectCache();
    const get = vi.spyOn(repo, "get");
    await resolveRedirect(code, { repo, cache });
    await resolveRedirect(code, { repo, cache });
    expect(get).toHaveBeenCalledTimes(1);
    await repo.updateDestination(code, "https://nuevo.example.com/", "2026-10-14T13:00:00.000Z");
    cache.delete(code);
    expect(await resolveRedirect(code, { repo, cache })).toEqual({ status: 302, location: "https://nuevo.example.com/" });
  });

  it("base de datos caída → 503 con Retry-After y SIN cachear el fallo (el siguiente escaneo reintenta)", async () => {
    const cache = new RedirectCache();
    let failing = true;
    const repo = {
      get: async () => {
        if (failing) throw new Error("db");
        return { v: 1 as const, code: "ab3de9xk", destination: "https://a.example.com/", originalUrl: "https://a.example.com/", createdAt: "2026-10-14T12:00:00.000Z", updatedAt: "2026-10-14T12:00:00.000Z", revision: 1, history: [] };
      },
    };
    const down = await resolveRedirect("ab3de9xk", { repo, cache });
    expect(down.status).toBe(503);
    expect(redirectResponse(down).headers.get("retry-after")).toBe("5");
    failing = false;
    expect((await resolveRedirect("ab3de9xk", { repo, cache })).status).toBe(302);
  });
});
