import { describe, expect, it } from "vitest";

import { GET } from "./route";

const call = (resortCode: string, service: string) =>
  GET(new Request("http://localhost"), { params: Promise.resolve({ resortCode, service }) } as Parameters<typeof GET>[1]);

describe("GET /api/qr/[resortCode]/[service]", () => {
  it("302 al destino, sin cache", async () => {
    const r = await call("TGPC", "pool");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://pool-service.palaceresorts.com/pool-area/TGPC");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("404 con resort o servicio desconocido", async () => {
    expect((await call("XXXX", "pool")).status).toBe(404);
    expect((await call("TGPC", "spa")).status).toBe(404);
  });
});
