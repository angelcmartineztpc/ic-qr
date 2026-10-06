import { test, expect, beforeEach } from "bun:test";
import { buildServiceUrl, getProperty, getPropertyByCode, PropertyError } from "./properties";

beforeEach(() => {
  process.env.QR_DOMAIN = "https://qr.example.com/";
});

test("buildServiceUrl devuelve la URL del redirect (sin slash doble)", () => {
  expect(buildServiceUrl(getProperty("cancun"), "restaurant")).toBe("https://qr.example.com/api/qr/TGCU/restaurant");
});
test("TGPC: pool y restaurant", () => {
  const p = getProperty("grand-punta-cana");
  expect(buildServiceUrl(p, "pool")).toBe("https://qr.example.com/api/qr/TGPC/pool");
  expect(buildServiceUrl(p, "restaurant")).toBe("https://qr.example.com/api/qr/TGPC/restaurant");
});
test("serviceUrls TGPC = destinos reales", () => {
  const p = getProperty("grand-punta-cana");
  expect(p.serviceUrls.pool).toBe("https://pool-service.palaceresorts.com/pool-area/TGPC");
  expect(p.serviceUrls.restaurant).toBe("https://pool-service.palaceresorts.com/restaurant/TGPC");
});
test("sin QR_DOMAIN lanza error", () => {
  delete process.env.QR_DOMAIN;
  expect(() => buildServiceUrl(getProperty("riviera"), "pool")).toThrow("QR_DOMAIN");
});
test("property/código inexistente", () => {
  expect(() => getProperty("x")).toThrow(PropertyError);
  expect(() => getPropertyByCode("x")).toThrow(PropertyError);
});
