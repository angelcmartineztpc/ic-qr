import { test, expect } from "bun:test";
import QRCode from "qrcode";
import { generateLabel, LabelError } from "./label";

const URL_ = "https://pool-service.palaceresorts.com/restaurant/TGPC";
const base = { stationName: "Tropical", spotType: "mesa", number: 1, service: "restaurant", url: URL_ } as const;

test("sin <text> ni fuentes", async () => {
  const svg = await generateLabel(base);
  expect(svg).not.toMatch(/<text|<tspan|font-family|@font-face/);
});
test("un solo path de QR + módulos coinciden con la URL", async () => {
  const svg = await generateLabel(base);
  expect(svg.match(/id="qr"/g)?.length).toBe(1);
  const d = svg.match(/id="qr"[^>]*d="([^"]+)"/)![1];
  const m = QRCode.create(URL_, { errorCorrectionLevel: "M" }).modules;
  const size = m.size;
  const get = (r: number, c: number) => m.get(r, c);
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (get(r, c)) dark++;
  const area = [...d.matchAll(/h([\d.]+)v/g)].reduce((s, m) => s + Number(m[1]), 0);
  const unit = 280 / (size + 8);
  expect(Math.round(area / unit)).toBe(dark);
});
test("determinista", async () => {
  expect(await generateLabel(base)).toBe(await generateLabel(base));
});
test("widthMm", async () => {
  expect(await generateLabel({ ...base, widthMm: 60 })).toContain('width="60mm"');
});
test("entrada inválida", async () => {
  expect(generateLabel({ ...base, number: 0 })).rejects.toBeInstanceOf(LabelError);
  expect(generateLabel({ ...base, stationName: " " })).rejects.toBeInstanceOf(LabelError);
});
