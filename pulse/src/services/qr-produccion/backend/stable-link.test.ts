import { describe, expect, it } from "vitest";

import { catalogLookup, parseStablePath, resolveStable, stableResponse } from "./stable-link";

describe("parseStablePath", () => {
  it.each([
    ["/qr-estable/PRPL/pool", "qr-estable"],
    ["/functions/v1/qr-estable/prpl/Pool", "qr-estable"],
    ["/PRPL/pool", "qr-estable"],
    ["/functions/v1/qr-enlaces/api/qr/PRPL/pool", "qr-enlaces"],
    ["/api/qr/PRPL/pool", "qr-enlaces"],
    ["/qr/PRPL/pool", "qr-estable"],
    ["/functions/v1/qr-estable/qr/PRPL/pool", "qr-estable"],
  ])("%s", (path, fn) => {
    expect(parseStablePath(path, fn)).toEqual({ resortCode: "PRPL", service: "pool" });
  });

  it("rechaza rutas con otra forma", () => {
    for (const path of ["/qr-estable", "/qr-estable/PRPL", "/qr-estable/PRPL/pool/extra", "/"]) expect(parseStablePath(path, "qr-estable"), path).toBeNull();
  });
});

describe("resolveStable", () => {
  it("redirige con 302 al destino vigente (sin caché ni referrer)", async () => {
    const outcome = await resolveStable({ resortCode: "PRPL", service: "restaurant" }, catalogLookup);
    expect(outcome).toEqual({ status: 302, location: "https://pool-service.palaceresorts.com/restaurant/PRPL" });
    const response = stableResponse(outcome);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://pool-service.palaceresorts.com/restaurant/PRPL");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("resort o servicio desconocido → 404; la base caída → 503 (no se confunde con «no existe»)", async () => {
    expect((await resolveStable({ resortCode: "ZZZZ", service: "pool" }, catalogLookup)).status).toBe(404);
    expect((await resolveStable({ resortCode: "PRPL", service: "spa" }, catalogLookup)).status).toBe(404);
    expect((await resolveStable(null, catalogLookup)).status).toBe(404);
    const down = await resolveStable({ resortCode: "PRPL", service: "pool" }, async () => {
      throw new Error("db");
    });
    expect(down.status).toBe(503);
    expect(stableResponse(down).headers.get("retry-after")).toBe("5");
  });

  it("el destino editado en la tabla gana al catálogo del código", async () => {
    const outcome = await resolveStable({ resortCode: "PRPL", service: "pool" }, async () => "https://nuevo.example.com/pool");
    expect(outcome).toEqual({ status: 302, location: "https://nuevo.example.com/pool" });
  });
});
