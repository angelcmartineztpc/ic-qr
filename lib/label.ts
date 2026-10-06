import { join } from "node:path";
import * as fontkit from "fontkit";
import QRCode from "qrcode";
import type { Service, SpotType } from "@/data/properties";

export class LabelError extends Error {}

export interface LabelInput {
  stationName: string;
  spotType: SpotType;
  number: number;
  service: Service;
  url: string;
  widthMm?: number;
}

const SIZE = 1000;
const MAX_W = 880;
const CONDENSE = 0.8;
const QUIET = 4;
const QR_SIDE = 280;

const TYPE_LABEL: Record<SpotType, string> = {
  mesa: "MESA – TABLE",
  camastro: "CAMASTRO – SUNBED",
};
const PREFIX: Record<SpotType, string> = { mesa: "M", camastro: "C" };
const COPY: Record<Service, [string, string]> = {
  restaurant: ["CONSULTA EL MENU Y ORDENA EN LÍNEA", "LOOK AT THE MENU AND ORDER ON LINE"],
  // ponytail: copy de pool es placeholder hasta confirmar
  pool: ["ESCANEA PARA ORDENAR EN LA ALBERCA", "SCAN TO ORDER AT THE POOL"],
};

let font: fontkit.Font | undefined;
function getFont(): fontkit.Font {
  if (!font) {
    try {
      const f = fontkit.openSync(join(process.cwd(), "public/fonts/Gotham-Bold.woff2"));
      if (!("layout" in f)) throw new Error("font collection");
      font = f;
    } catch (e) {
      throw new LabelError(`Font load failed: ${(e as Error).message}`);
    }
  }
  return font;
}

const n2 = (n: number) => Math.round(n * 100) / 100;

function measure(text: string, size: number): number {
  const f = getFont();
  const adv = f.layout(text).positions.reduce((s, p) => s + p.xAdvance, 0);
  return (adv * size * CONDENSE) / f.unitsPerEm;
}

// Texto centrado → un solo `d`; reduce el tamaño si excede maxW.
function textPath(text: string, size: number, baseline: number, maxW = MAX_W): string {
  const f = getFont();
  const w = measure(text, size);
  const s = w > maxW ? (size * maxW) / w : size;
  const k = s / f.unitsPerEm;
  let x = (SIZE - measure(text, s)) / 2;
  const run = f.layout(text);
  const parts: string[] = [];
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const d = g.path
      .transform(k * CONDENSE, 0, 0, -k, x + p.xOffset * k * CONDENSE, baseline - p.yOffset * k)
      .toSVG();
    if (d) parts.push(d);
    x += p.xAdvance * k * CONDENSE;
  });
  return parts.join("").replace(/-?\d+\.\d+/g, (m) => String(n2(Number(m))));
}

function qrPath(url: string): string {
  const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  const size = m.size;
  const get = (r: number, c: number) => m.get(r, c);
  const unit = QR_SIDE / (size + QUIET * 2);
  const x0 = (SIZE - QR_SIDE) / 2;
  const y0 = SIZE - QR_SIDE - 30;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!get(r, c)) continue;
      let end = c;
      while (end + 1 < size && get(r, end + 1)) end++;
      parts.push(`M${n2(x0 + (c + QUIET) * unit)} ${n2(y0 + (r + QUIET) * unit)}h${n2((end - c + 1) * unit)}v${n2(unit)}h-${n2((end - c + 1) * unit)}z`);
      c = end;
    }
  }
  return parts.join("");
}

export async function generateLabel(input: LabelInput): Promise<string> {
  const { stationName, spotType, number, service, url, widthMm = 100 } = input;
  if (!stationName.trim()) throw new LabelError("stationName required");
  if (!Number.isInteger(number) || number < 1) throw new LabelError("number must be integer >= 1");
  if (!(widthMm > 0)) throw new LabelError("widthMm must be > 0");
  if (!URL.canParse(url)) throw new LabelError("Invalid url");

  const [l1, l2] = COPY[service];
  const texts = [
    textPath(stationName.trim().toUpperCase(), 130, 170),
    textPath(TYPE_LABEL[spotType], 48, 240),
    textPath(`${PREFIX[spotType]}${number}`, 210, 430),
    textPath(l1, 64, 560, 920),
    textPath(l2, 64, 640, 920),
  ].join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${widthMm}mm" height="${widthMm}mm">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>` +
    `<path id="text" fill="#000" d="${texts}"/>` +
    `<path id="qr" fill="#000" shape-rendering="crispEdges" d="${qrPath(url)}"/>` +
    `</svg>`
  );
}
