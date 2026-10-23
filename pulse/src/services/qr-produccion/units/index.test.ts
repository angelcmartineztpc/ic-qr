import { describe, expect, it } from "vitest";

import { cmToMm, MM_TO_PT, mmToPt, mmToSvg, PAGE_SIZES_MM, pageSizePt, ptToMm, round } from "./index";

describe("unidades", () => {
  it("50 mm = 141.732283 pt (pieza)", () => {
    expect(mmToPt(50)).toBeCloseTo(141.732283, 6);
  });

  it("1 cm = 10 mm = 28.346457 pt", () => {
    expect(cmToMm(1)).toBe(10);
    expect(mmToPt(cmToMm(1))).toBeCloseTo(28.346457, 6);
  });

  it("A4 = 595.275591 × 841.889764 pt y Letter = 612 × 792 pt (±1e-6)", () => {
    const [w, h] = pageSizePt(PAGE_SIZES_MM.A4.width, PAGE_SIZES_MM.A4.height);
    expect(Math.abs(w - 595.275591)).toBeLessThan(1e-6);
    expect(Math.abs(h - 841.889764)).toBeLessThan(1e-6);
    const [lw, lh] = pageSizePt(PAGE_SIZES_MM.Letter.width, PAGE_SIZES_MM.Letter.height);
    expect(lw).toBeCloseTo(612, 9);
    expect(lh).toBeCloseTo(792, 9);
  });

  it("pt ↔ mm es reversible", () => {
    expect(ptToMm(mmToPt(37.5))).toBeCloseTo(37.5, 12);
    expect(MM_TO_PT).toBeCloseTo(2.834645669, 9);
  });

  it("SVG en décimas de mm: 50 mm → 500", () => {
    expect(mmToSvg(50)).toBe(500);
  });

  it("round evita la deriva binaria", () => {
    expect(round(0.1 + 0.2)).toBe(0.3);
    expect(round(13.4999, 0.5)).toBe(13.5);
  });
});
