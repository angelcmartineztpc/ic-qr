import { describe, expect, it } from "vitest";

import { PDFOptionsSchema } from "@/schemas/pdf";
import { mmToPt } from "@/lib/units";
import type { PDFOptions } from "@/types";

import { describeSheet, packGrid, pageCount, paginate, SheetLayoutError } from "./sheet";

const TILE = { width: 50, height: 50 };
const options = (overrides: Partial<PDFOptions> = {}): PDFOptions => ({ ...PDFOptionsSchema.parse({}), ...overrides });
const margins = (m: number) => ({ top: m, right: m, bottom: m, left: m });

describe("packGrid — tabla de §E.7", () => {
  it.each([
    ["A4, margen 10, gap 5 (por defecto)", options(), 3, 5, 15, [25, 13.5], 17],
    ["A4, margen 10, gap 0", options({ gapMm: 0 }), 3, 5, 15, [30, 23.5], 17],
    ["A4, margen 5, gap 0", options({ margins: margins(5), gapMm: 0 }), 4, 5, 20, [5, 23.5], 13],
    ["A4, margen 10, gap 5, sangrado 2", options({ bleedMm: 2 }), 3, 4, 12, [21, 35], 21],
    ["A4 apaisado, margen 10, gap 5", options({ orientation: "landscape" }), 5, 3, 15, [13.5, 25], 17],
    ["Letter, margen 10, gap 5", options({ pageSize: { kind: "Letter" } }), 3, 4, 12, [27.95, 32.2], 21],
    ["Letter, margen 6.35, gap 0", options({ pageSize: { kind: "Letter" }, margins: margins(6.35), gapMm: 0 }), 4, 5, 20, [7.95, 14.7], 13],
    ["A4, margen 10, gap 5, maxCols 2", options({ maxCols: 2 }), 2, 5, 10, [52.5, 13.5], 25],
  ] as const)("%s", (_name, opts, cols, rows, perPage, [x, y], pagesFor248) => {
    const grid = packGrid({ tile: TILE, options: opts });
    expect([grid.cols, grid.rows, grid.perPage]).toEqual([cols, rows, perPage]);
    expect(grid.originMm.x).toBeCloseTo(x, 9);
    expect(grid.originMm.y).toBeCloseTo(y, 9);
    expect(pageCount(248, grid)).toBe(pagesFor248);
  });

  it("origen por defecto en pt: (70.866142, 38.267717)", () => {
    const grid = packGrid({ tile: TILE, options: options() });
    expect(mmToPt(grid.originMm.x)).toBeCloseTo(70.866142, 6);
    expect(mmToPt(grid.originMm.y)).toBeCloseTo(38.267717, 6);
  });

  it("encaje exacto 4 × 50 = 200 mm (protección 1e-9)", () => {
    const grid = packGrid({ tile: TILE, options: options({ pageSize: { kind: "custom", widthMm: 200, heightMm: 200 }, margins: margins(0), gapMm: 0 }) });
    expect([grid.cols, grid.rows]).toEqual([4, 4]);
  });

  it("tamaño personalizado: se respeta ancho × alto tal como se escribió; 'auto' prueba también el giro", () => {
    const landscape = packGrid({ tile: TILE, options: options({ pageSize: { kind: "custom", widthMm: 150, heightMm: 100 }, margins: margins(0), gapMm: 0 }) });
    expect(landscape.pageMm).toEqual({ width: 150, height: 100 });
    expect([landscape.orientation, landscape.cols, landscape.rows]).toEqual(["landscape", 3, 2]);
    const rotated = packGrid({ tile: TILE, options: options({ pageSize: { kind: "custom", widthMm: 100, heightMm: 150 }, orientation: "auto", margins: margins(0), gapMm: 0 }) });
    expect(rotated.perPage).toBe(6);
  });

  it("personalizado 60 × 60 con margen 10 → TILE_DOES_NOT_FIT", () => {
    const run = () => packGrid({ tile: TILE, options: options({ pageSize: { kind: "custom", widthMm: 60, heightMm: 60 } }) });
    expect(run).toThrow(SheetLayoutError);
    expect(run).toThrow(/no cabe/);
  });

  it("'auto' elige la orientación con más piezas; empate → vertical", () => {
    const auto = packGrid({ tile: TILE, options: options({ orientation: "auto" }) });
    expect(auto.orientation).toBe("portrait"); // 15 = 15
    // Márgenes laterales de 30: vertical 3 × 5 = 15; horizontal 4 × 4 = 16 → gana horizontal.
    const wide = packGrid({ tile: TILE, options: options({ orientation: "auto", margins: { top: 5, bottom: 5, left: 30, right: 30 }, gapMm: 0 }) });
    expect([wide.orientation, wide.cols, wide.rows]).toEqual(["landscape", 4, 4]);
  });

  it("modo 'single': una pieza por página de 141.732 × 141.732 pt", () => {
    const grid = packGrid({ tile: TILE, options: options({ mode: "single" }) });
    expect(grid).toMatchObject({ cols: 1, rows: 1, perPage: 1, originMm: { x: 0, y: 0 } });
    expect(mmToPt(grid.pageMm.width)).toBeCloseTo(141.732283, 6);
    expect(pageCount(248, grid)).toBe(248);
  });
});

describe("paginate", () => {
  it("coloca las piezas en orden de lectura, sin deriva acumulada", () => {
    const grid = packGrid({ tile: TILE, options: options() });
    const slots = paginate(248, grid);
    expect(slots[0]).toEqual({ page: 0, index: 0, xMm: 25, yMm: 13.5 });
    expect(slots[1]).toMatchObject({ page: 0, xMm: 80, yMm: 13.5 });
    expect(slots[3]).toMatchObject({ page: 0, xMm: 25, yMm: 68.5 });
    expect(slots[14]).toMatchObject({ page: 0, xMm: 135, yMm: 233.5 });
    expect(slots[15]).toMatchObject({ page: 1, xMm: 25, yMm: 13.5 });
    expect(slots[247]?.page).toBe(16);
    // Ninguna pieza se sale de la página.
    for (const slot of slots) {
      expect(slot.xMm + 50).toBeLessThanOrEqual(210 - 10 + 1e-9);
      expect(slot.yMm + 50).toBeLessThanOrEqual(297 - 10 + 1e-9);
    }
  });

  it("describeSheet para el panel", () => {
    const grid = packGrid({ tile: TILE, options: options() });
    expect(describeSheet(248, grid)).toBe("15 por página · 17 páginas");
    expect(describeSheet(3, grid)).toBe("15 por página · 1 página");
  });
});
