import { test, expect } from "bun:test";
import { GET } from "./route";

const call = (resortCode: string, service: string) =>
  GET(new Request("http://localhost"), { params: Promise.resolve({ resortCode, service }) });

test("302 al destino", async () => {
  const r = await call("TGPC", "pool");
  expect(r.status).toBe(302);
  expect(r.headers.get("location")).toBe("https://pool-service.palaceresorts.com/pool-area/TGPC");
  expect(r.headers.get("cache-control")).toBe("no-store");
});
test("restaurant", async () => {
  expect((await call("TGCU", "restaurant")).headers.get("location")).toEndWith("/restaurant/TGCU");
});
test("404 resort o service desconocido", async () => {
  expect((await call("XXXX", "pool")).status).toBe(404);
  expect((await call("TGPC", "spa")).status).toBe(404);
});
