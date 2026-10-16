import { describe, expect, it } from "vitest";

import { buildServiceUrl, findPropertyByCode, isService, properties } from "./properties";

describe("resorts", () => {
  it("tiene 9 resorts con código único y destinos que terminan en su código", () => {
    expect(properties).toHaveLength(9);
    expect(new Set(properties.map((p) => p.resortCode)).size).toBe(9);
    for (const p of properties) {
      expect(p.serviceUrls.pool).toMatch(new RegExp(`/pool-area/${p.resortCode}$`));
      expect(p.serviceUrls.restaurant).toMatch(new RegExp(`/restaurant/${p.resortCode}$`));
    }
  });

  it("TGPC apunta a los destinos reales", () => {
    const p = findPropertyByCode("TGPC");
    expect(p?.serviceUrls.pool).toBe("https://pool-service.palaceresorts.com/pool-area/TGPC");
    expect(p?.serviceUrls.restaurant).toBe("https://pool-service.palaceresorts.com/restaurant/TGPC");
  });

  it("buildServiceUrl devuelve la URL estable (sin slash doble) y no el destino", () => {
    const p = findPropertyByCode("TGCU")!;
    expect(buildServiceUrl(p, "restaurant", "https://qr.example.com/")).toBe("https://qr.example.com/api/qr/TGCU/restaurant");
  });

  it("isService / código desconocido", () => {
    expect(isService("pool")).toBe(true);
    expect(isService("spa")).toBe(false);
    expect(findPropertyByCode("XXXX")).toBeUndefined();
  });
});
