/**
 * Prueba de legibilidad REAL del estilo del QR: cada combinación se dibuja con
 * la misma escena y el mismo renderer SVG que usa la exportación, se rasteriza
 * con sharp y se decodifica con el lector de la librería `qr`. Si una forma,
 * color o logo deja el código ilegible, esta prueba lo detecta.
 */
import { decodeQR } from "qr/decode.js";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildScene } from "@/lib/document/scene";
import { encodeMatrix } from "@/lib/qr/encode";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { DEFAULT_QR_STYLE, QR_EYE_BALL_SHAPES, QR_EYE_FRAME_SHAPES, QR_MODULE_SHAPES, type QrStyle } from "@/schemas/qr-style";
import type { QrGeometry } from "@/types";

import { fakeFonts } from "../helpers/fake-font";
import { legacyTile } from "../helpers/legacy-tile";

const PAYLOAD = "https://menu.example.com/tropical/playa-san-jose?mesa=B1";
const matrix = encodeMatrix(PAYLOAD);
const qr: QrGeometry = { kind: "matrix", matrix, modules: matrix.length };
const style = (patch: Partial<QrStyle> = {}): QrStyle => ({ ...structuredClone(DEFAULT_QR_STYLE), ...patch });

const LOGO = {
  geometry: {
    viewBox: [0, 0, 100, 100] as [number, number, number, number],
    nodes: [
      { type: "path" as const, d: "M50 5L95 50L50 95L5 50Z", fill: "#274C69" as const, fillRule: "nonzero" as const },
      { type: "rect" as const, x: 40, y: 40, w: 20, h: 20, fill: "#FFFFFF" as const },
    ],
  },
  sizePct: 20,
  marginModules: 1,
  color: null,
  fileName: "logo.svg",
};

async function decode(qrStyle: QrStyle): Promise<string | undefined> {
  const template = legacyTile();
  const scene = buildScene({ template, layout: template.defaultLayout, record: { id: "r", area: "A", estacion: "E", mesa: "M", subgrupo: "", concepto: "", menuUrl: PAYLOAD }, qr, fonts: fakeFonts, qrStyle });
  // Solo el QR: sin texto ni fondo de la pieza, para que el lector no vea otra cosa.
  const onlyQr = { ...scene, nodes: scene.nodes.filter((node) => node.layer === "qr") };
  const svg = renderSceneSvg(onlyQr).replace(/ width="[\d.]+mm" height="[\d.]+mm"/, ' width="1500" height="1500"');
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  try {
    return decodeQR({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
  } catch {
    return undefined;
  }
}

describe("el QR con estilo se lee", () => {
  it("el QR clásico se lee (control de la prueba)", async () => {
    expect(await decode(style())).toBe(PAYLOAD);
  });

  for (const modules of QR_MODULE_SHAPES) {
    it(`forma de módulos «${modules}»`, async () => {
      expect(await decode(style({ modules }))).toBe(PAYLOAD);
    });
  }

  for (const frame of QR_EYE_FRAME_SHAPES) {
    for (const ball of QR_EYE_BALL_SHAPES) {
      it(`esquinas: marco «${frame}» + centro «${ball}»`, async () => {
        expect(await decode(style({ eyeFrame: frame, eyeBall: ball }))).toBe(PAYLOAD);
      });
    }
  }

  it("colores propios (azul marino, esquinas rojas oscuras, fondo crema)", async () => {
    const colors = { modules: "#274C69", eyeFrame: "#7A1F1F", eyeBall: "#7A1F1F", background: "#FFF8E7" } as const;
    expect(await decode(style({ colors }))).toBe(PAYLOAD);
  });

  it("contorno circular", async () => {
    expect(await decode(style({ outline: "circle" }))).toBe(PAYLOAD);
  });

  it("con logo al centro", async () => {
    expect(await decode(style({ logo: LOGO }))).toBe(PAYLOAD);
  });

  it("con logo recoloreado", async () => {
    expect(await decode(style({ logo: { ...LOGO, color: "#274C69" } }))).toBe(PAYLOAD);
  });

  it("todo junto: puntos, esquinas redondas, colores, círculo y logo", async () => {
    const full = style({
      outline: "circle",
      modules: "dots",
      eyeFrame: "rounded",
      eyeBall: "circle",
      colors: { modules: "#274C69", eyeFrame: "#12324A", eyeBall: "#12324A", background: "#FFFFFF" },
      logo: { ...LOGO, sizePct: 18 },
    });
    expect(await decode(full)).toBe(PAYLOAD);
  });

  it("un QR casi sin contraste NO se lee (y por eso el editor lo bloquea)", async () => {
    const faint = style({ colors: { modules: "#E8E8E8", eyeFrame: null, eyeBall: null, background: "#FFFFFF" } });
    expect(await decode(faint)).not.toBe(PAYLOAD);
  });
});
