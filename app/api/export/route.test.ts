import { test, expect } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

process.env.QR_DOMAIN = "https://qr.example.com";
const ok = { propertyId: "cancun", stationName: "Tropical", spotType: "mesa", startNumber: 1, endNumber: 12, service: "restaurant" };
const post = (b: unknown) =>
  POST(new NextRequest("http://localhost/api/export", { method: "POST", body: JSON.stringify(b) }));
const code = async (r: Response) => (await r.json()).code;

test("ZIP con nombres ordenados", async () => {
  const r = await post(ok);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("application/zip");
  const buf = Buffer.from(await r.arrayBuffer());
  const names = [...buf.toString("latin1").matchAll(/M\d{2}\.svg/g)].map((m) => m[0]);
  const uniq = [...new Set(names)];
  expect(uniq.length).toBe(12);
  expect(uniq).toEqual([...uniq].sort());
  expect(uniq[0]).toBe("M01.svg");
});
test("500 OK", async () => {
  expect((await post({ ...ok, startNumber: 1, endNumber: 500 })).status).toBe(200);
}, 60000);
test("501 → LIMIT_EXCEEDED", async () => {
  const r = await post({ ...ok, startNumber: 1, endNumber: 501 });
  expect(r.status).toBe(400);
  expect(await code(r)).toBe("LIMIT_EXCEEDED");
});
test("propertyId inexistente → 404", async () => {
  const r = await post({ ...ok, propertyId: "nope" });
  expect(r.status).toBe(404);
  expect(await code(r)).toBe("PROPERTY_NOT_FOUND");
});
test("400s", async () => {
  for (const b of [
    { ...ok, startNumber: 5, endNumber: 2 },
    { ...ok, service: "spa" },
    { ...ok, spotType: "x" },
    { ...ok, stationName: undefined },
    { ...ok, startNumber: 0 },
  ]) {
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(await code(r)).toBe("INVALID_INPUT");
  }
});
