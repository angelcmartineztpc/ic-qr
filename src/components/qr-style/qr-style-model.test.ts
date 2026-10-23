import { describe, expect, it } from "vitest";

import { DEFAULT_QR_STYLE, type QrStyle } from "@/schemas/qr-style";
import type { QRRecord } from "@/types";

import { blockingStyleWarnings, hasOwnQr, isStylable, stylablePayload } from "./qr-style-model";

const QR = { invert: false, foreground: "#000000", background: "#FFFFFF", quietZoneModules: 0, minModuleMm: 0.3, warnModuleMm: 0.5 } as const;
const record = (patch: Partial<QRRecord> = {}): QRRecord => ({ menuUrl: "https://menu.example.com/a", qr: { source: "none" }, ...patch }) as QRRecord;
const style = (patch: Partial<QrStyle>): QrStyle => ({ ...structuredClone(DEFAULT_QR_STYLE), ...patch });

describe("qué piezas se pueden estilizar", () => {
  it("un QR por generar usa el Link del menú", () => {
    expect(stylablePayload(record())).toBe("https://menu.example.com/a");
    expect(isStylable(record())).toBe(true);
  });

  it("un QR ya generado usa el contenido guardado", () => {
    const generated = record({ qr: { source: "generated", payload: "https://menu.example.com/viejo" } as QRRecord["qr"] });
    expect(stylablePayload(generated)).toBe("https://menu.example.com/viejo");
  });

  it("REGLA CRÍTICA: una pieza con Link del QR (verificado o no) nunca se estiliza", () => {
    expect(stylablePayload(record({ qrUrl: "https://assets.example.com/qr.svg" }))).toBeNull();
    expect(stylablePayload(record({ qr: { source: "existing" } as QRRecord["qr"] }))).toBeNull();
    expect(hasOwnQr(record({ qrUrl: "https://assets.example.com/qr.svg" }))).toBe(true);
    expect(hasOwnQr(record())).toBe(false);
  });

  it("sin Link del menú válido no hay nada que estilizar", () => {
    expect(stylablePayload(record({ menuUrl: "no es una url" }))).toBeNull();
    expect(stylablePayload(record({ menuUrl: "" }))).toBeNull();
  });
});

describe("bloqueos de exportación por estilo", () => {
  const colors = (modules: `#${string}`) => ({ ...DEFAULT_QR_STYLE.colors, modules }) as QrStyle["colors"];

  it("el QR clásico no bloquea", () => {
    expect(blockingStyleWarnings(DEFAULT_QR_STYLE, QR, [record()])).toEqual([]);
  });

  it("contraste casi nulo bloquea", () => {
    const blockers = blockingStyleWarnings(style({ colors: colors("#EEEEEE") }), QR, [record()]);
    expect(blockers.length).toBeGreaterThan(0); // módulos y, al heredarlo, también las esquinas
    expect(blockers.every((w) => w.code === "QR_STYLE_LOW_CONTRAST")).toBe(true);
  });

  it("un color con poco contraste solo avisa: no bloquea", () => {
    expect(blockingStyleWarnings(style({ colors: colors("#888888") }), QR, [record()])).toEqual([]);
  });

  it("si todas las piezas traen su propio QR, el estilo no se aplica y no bloquea", () => {
    expect(blockingStyleWarnings(style({ colors: colors("#EEEEEE") }), QR, [record({ qrUrl: "https://assets.example.com/qr.svg" })])).toEqual([]);
  });
});
