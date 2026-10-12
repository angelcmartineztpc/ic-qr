import { describe, expect, it } from "vitest";

import type { Box, TileSpec } from "@/types";

import { boxesOverlap, clampBox, isInside, moveBox, nudge, resizeBox, snapBox, snapTargets } from "./geometry";
import { detectPreset, qrPresetBox } from "./presets";
import { applyLayoutChange, isCustomized, pruneLayoutOverrides, resetOverride, resolveLayout } from "./resolve-layout";
import { layoutWarnings, qrModuleMm, qrModuleWarning } from "./warnings";

const TILE: TileSpec = { width: 50, height: 50, safeMarginMm: 2 };
const QR: Box = { x: 13, y: 24, width: 24, height: 24 };
const CONTENT: Box = { x: 4, y: 3, width: 42, height: 20 };

describe("clamp / move (spec §46: nada sale de la pieza)", () => {
  it("clampBox mantiene la caja dentro de los 50 × 50 mm", () => {
    expect(clampBox({ x: -5, y: 40, width: 24, height: 24 }, TILE)).toEqual({ x: 0, y: 26, width: 24, height: 24 });
    expect(clampBox({ x: 0, y: 0, width: 80, height: 10 }, TILE)).toEqual({ x: 0, y: 0, width: 50, height: 10 });
  });

  it("moveBox y nudge respetan los límites", () => {
    expect(moveBox(QR, 100, -100, TILE)).toEqual({ x: 26, y: 0, width: 24, height: 24 });
    expect(nudge(QR, "left", 0.5, TILE).x).toBe(12.5);
    expect(nudge(QR, "down", 5, TILE).y).toBe(26);
    expect(isInside(nudge(QR, "down", 5, TILE), TILE)).toBe(true);
  });
});

describe("resizeBox", () => {
  it("redimensiona libremente el bloque de texto con el lado opuesto fijo", () => {
    expect(resizeBox(CONTENT, "e", -10, 0, TILE)).toEqual({ x: 4, y: 3, width: 32, height: 20 });
    expect(resizeBox(CONTENT, "nw", 2, 1, TILE)).toEqual({ x: 6, y: 4, width: 40, height: 19 });
  });

  it("no deja que la caja salga de la pieza ni baje del mínimo", () => {
    expect(resizeBox(CONTENT, "e", 50, 0, TILE).width).toBe(46);
    expect(resizeBox(CONTENT, "w", 100, 0, TILE).width).toBe(5);
  });

  it("el QR se mantiene cuadrado (aspecto bloqueado) y anclado a la esquina opuesta", () => {
    const grown = resizeBox(QR, "nw", -4, -1, TILE, { lockAspect: true });
    expect(grown).toEqual({ x: 9, y: 20, width: 28, height: 28 });
    const capped = resizeBox(QR, "se", 30, 30, TILE, { lockAspect: true });
    expect(capped.width).toBe(capped.height);
    expect(isInside(capped, TILE)).toBe(true);
  });
});

describe("snap", () => {
  it("imanta el centro al centro de la pieza", () => {
    const result = snapBox({ ...QR, x: 13.4 }, snapTargets(TILE), 1);
    expect(result.box.x).toBe(13);
    expect(result.guides.x).toBe(25);
  });

  it("no imanta fuera del umbral", () => {
    const result = snapBox({ ...QR, x: 15.5, y: 15.5 }, snapTargets(TILE), 0.4);
    expect(result.box).toEqual({ ...QR, x: 15.5, y: 15.5 });
    expect(result.guides).toEqual({});
  });

  it("imanta a los bordes de la otra caja", () => {
    const targets = snapTargets(TILE, CONTENT);
    const result = snapBox({ ...QR, y: 23.3 }, targets, 0.5);
    expect(result.box.y).toBe(23);
  });
});

describe("presets del QR (spec §47)", () => {
  it.each([
    ["bottom-center", 13, 24],
    ["bottom-left", 2, 24],
    ["bottom-right", 24, 24],
    ["center", 13, 13],
  ] as const)("%s", (preset, x, y) => {
    expect(qrPresetBox(preset, 24, TILE)).toEqual({ x, y, width: 24, height: 24 });
  });

  it("detectPreset reconoce la posición y vuelve a Personalizado tras arrastrar", () => {
    expect(detectPreset(QR, TILE)).toBe("bottom-center");
    expect(detectPreset({ ...QR, x: 13.04 }, TILE)).toBe("bottom-center");
    expect(detectPreset({ ...QR, x: 14 }, TILE)).toBe("custom");
  });
});

describe("layout del proyecto (base + overrides)", () => {
  const layout = { templateId: "tropical-table", base: { qr: QR, content: CONTENT }, overrides: {} };

  it("'Todas' escribe en la base; 'Solo esta pieza' en su override", () => {
    const all = applyLayoutChange(layout, { qr: { ...QR, x: 2 } }, { kind: "all" });
    expect(resolveLayout(all, "r1").qr.x).toBe(2);

    const single = applyLayoutChange(layout, { qr: { ...QR, x: 24 } }, { kind: "single", recordId: "r1" });
    expect(resolveLayout(single, "r1").qr.x).toBe(24);
    expect(resolveLayout(single, "r2").qr.x).toBe(13);
    expect(resolveLayout(single, "r1").content).toEqual(CONTENT);
    expect(isCustomized(single, "r1")).toBe(true);
    expect(isCustomized(resetOverride(single, "r1"), "r1")).toBe(false);
    expect(pruneLayoutOverrides(single, new Set(["r2"])).overrides).toEqual({});
  });
});

describe("avisos de layout", () => {
  it("el layout por defecto de TropicalTable no tiene avisos", () => {
    expect(layoutWarnings({ qr: QR, content: CONTENT }, TILE)).toEqual([]);
  });

  it("solape y margen de seguridad", () => {
    const centered = { qr: qrPresetBox("center", 24, TILE), content: CONTENT };
    expect(layoutWarnings(centered, TILE)).toContainEqual({ code: "OVERLAP", between: ["qr", "content"] });
    expect(layoutWarnings({ qr: { ...QR, y: 26 }, content: CONTENT }, TILE)).toContainEqual({ code: "OUTSIDE_SAFE_MARGIN", box: "qr" });
    expect(boxesOverlap(QR, { ...CONTENT, height: 21 })).toBe(false);
  });

  it("política de módulo: QR v4 (33) en 24 mm con zona 2 → 0.649 mm OK; v8 (49) → aviso; v9 (53) → bloqueo", () => {
    const policy = { minModuleMm: 0.45, warnModuleMm: 0.6 };
    expect(qrModuleMm(24, 33, 2)).toBeCloseTo(0.6486, 3);
    expect(qrModuleWarning(qrModuleMm(24, 33, 2), policy)).toBeNull();
    expect(qrModuleWarning(qrModuleMm(24, 49, 2), policy)).toMatchObject({ level: "warn" });
    expect(qrModuleWarning(qrModuleMm(24, 53, 2), policy)).toMatchObject({ level: "block" });
  });
});
