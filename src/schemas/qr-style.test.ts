import { describe, expect, it } from "vitest";

import { DEFAULT_QR_STYLE, QrLogoGeometrySchema } from "./qr-style";
import { EMPTY_TEMPLATE_OVERRIDES } from "./template";

const path = { type: "path", d: "M0 0L10 0L10 10Z", fill: "#112233", fillRule: "nonzero" } as const;
const geometry = (node: object) => ({ viewBox: [0, 0, 100, 100], nodes: [node] });

describe("logo del estilo del QR: solo relleno", () => {
  it("acepta un path con relleno", () => {
    expect(QrLogoGeometrySchema.safeParse(geometry(path)).success).toBe(true);
  });

  it("rechaza un path con trazo: el PDF no lo dibujaría y el SVG sí", () => {
    expect(QrLogoGeometrySchema.safeParse(geometry({ ...path, stroke: "#000000" })).success).toBe(false);
    expect(QrLogoGeometrySchema.safeParse(geometry({ ...path, strokeWidth: 2 })).success).toBe(false);
  });
});

describe("estilo del QR por defecto", () => {
  it("los ajustes vacíos de la plantilla no comparten el objeto por defecto", () => {
    expect(EMPTY_TEMPLATE_OVERRIDES.qrStyle).toEqual(DEFAULT_QR_STYLE);
    expect(EMPTY_TEMPLATE_OVERRIDES.qrStyle).not.toBe(DEFAULT_QR_STYLE);
    expect(EMPTY_TEMPLATE_OVERRIDES.qrStyle.colors).not.toBe(DEFAULT_QR_STYLE.colors);
  });
});
