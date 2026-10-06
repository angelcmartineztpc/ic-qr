import { test, expect } from "bun:test";
import { NextRequest } from "next/server";
import { generateQR, QRError } from "./qr-generator";
import { GET } from "../app/api/qr/route";

const U = "https://cancun.example.com/m12?z=Alberca";
const req = (q: string) => new NextRequest(`http://localhost/api/qr${q}`);

test("svg", async () => {
  expect(await generateQR(U)).toStartWith("<svg");
});
test("determinista", async () => {
  expect(await generateQR(U)).toBe(await generateQR(U));
});
test("url vacía", () => expect(generateQR("")).rejects.toBeInstanceOf(QRError));
test("url inválida", () => expect(generateQR("nope")).rejects.toBeInstanceOf(QRError));
test("GET 200", async () => {
  const r = await GET(req(`?url=${encodeURIComponent(U)}`));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("image/svg+xml");
});
test("GET sin url", async () => expect((await GET(req(""))).status).toBe(400));
test("GET url inválida", async () => expect((await GET(req("?url=nope"))).status).toBe(400));
