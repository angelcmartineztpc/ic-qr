import { describe, expect, it } from "vitest";

import { DEFAULT_QR_STYLE, type QrStyle } from "@/services/qr-produccion/schemas/qr-style";
import type { HexColor } from "@/types";

import { blockingQrStyleWarnings } from "./warnings";

const QR = { invert: false, foreground: "#000000" as HexColor, background: "#FFFFFF" as HexColor };
const style = (patch: Partial<QrStyle>): QrStyle => ({ ...structuredClone(DEFAULT_QR_STYLE), ...patch });
const logo = (sizePct: number, marginModules = 3) => ({ geometry: { viewBox: [0, 0, 10, 10], nodes: [{ type: "rect", x: 0, y: 0, w: 10, h: 10, fill: "#000000" }] }, sizePct, marginModules, color: null, fileName: "l.svg" }) as unknown as QrStyle["logo"];

describe("avisos que bloquean la fabricación (cliente y servidor comparten esta regla)", () => {
  it("el QR clásico no bloquea", () => {
    expect(blockingQrStyleWarnings(DEFAULT_QR_STYLE, QR, ["https://menu.example.com/a"])).toEqual([]);
  });

  it("contraste casi nulo bloquea", () => {
    const light = style({ colors: { modules: "#F5F5F5" as HexColor, eyeFrame: null, eyeBall: null, background: null } });
    expect(blockingQrStyleWarnings(light, QR, ["https://menu.example.com/a"]).map((w) => w.code)).toContain("QR_STYLE_LOW_CONTRAST");
  });

  it("un logo demasiado grande bloquea según el contenido MÁS CORTO", () => {
    const big = style({ logo: logo(30) });
    const short = "ab"; // versión 1 (21 módulos): el logo tapa >30 %
    const long = `https://menu.example.com/${"x".repeat(400)}`;
    expect(blockingQrStyleWarnings(big, QR, [long, short]).map((w) => w.code)).toContain("QR_STYLE_LOGO_LARGE");
    expect(blockingQrStyleWarnings(big, QR, [long]).map((w) => w.code)).not.toContain("QR_STYLE_LOGO_LARGE");
  });

  it("sin piezas con QR estilizable no hay nada que bloquear", () => {
    expect(blockingQrStyleWarnings(style({ colors: { modules: "#F5F5F5" as HexColor, eyeFrame: null, eyeBall: null, background: null } }), QR, [])).toEqual([]);
  });
});
