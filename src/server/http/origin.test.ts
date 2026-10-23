import { describe, expect, it } from "vitest";

import { isAllowedHost, type OriginConfig } from "./origin";

const config: OriginConfig = { allowedHosts: ["localhost:*", "192.168.50.62:3000"], allowedOrigins: [], trustProxyHops: 0 };
const check = (host: string) => isAllowedHost(new Headers({ host }), config);

describe("isAllowedHost", () => {
  it("acepta un host con wildcard de puerto y rechaza otros nombres", () => {
    expect(check("localhost:3001")).toBe(true);
    expect(check("localhost")).toBe(true);
    expect(check("localhost.evil.example:3001")).toBe(false);
    expect(check("evil.example")).toBe(false);
  });

  it("sigue exigiendo coincidencia exacta para entradas sin wildcard", () => {
    expect(check("192.168.50.62:3000")).toBe(true);
    expect(check("192.168.50.62:3001")).toBe(false);
  });
});
