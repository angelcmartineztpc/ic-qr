import { describe, expect, it } from "vitest";

import { encodeMatrix } from "@/lib/qr/encode";
import { DEFAULT_QR_STYLE, QR_EYE_BALL_SHAPES, QR_EYE_FRAME_SHAPES, QR_MODULE_SHAPES, QrStyleSchema, type QrStyle } from "@/schemas/qr-style";
import { EMPTY_TEMPLATE_OVERRIDES, TemplateOverridesSchema } from "@/schemas/template";

import { bodyMatrix, FINDER, inFinder, roundedLoop } from "./shapes";
import { CIRCLE_QUIET_MODULES, isDefaultQrStyle, logoPlacement, qrPlacement, recolorLogo, resolveStyleColors, styleQrPaths } from "./style-qr";
import { contrastRatio, qrStyleWarnings } from "./warnings";

const MATRIX = encodeMatrix("https://example.com/menu/playa-san-jose");
const N = MATRIX.length;
const PLACE = { x: 0, y: 0, module: 1, decimals: 3 };
const style = (patch: Partial<QrStyle> = {}): QrStyle => ({ ...structuredClone(DEFAULT_QR_STYLE), ...patch });

const LOGO = {
  geometry: { viewBox: [0, 0, 100, 100] as [number, number, number, number], nodes: [{ type: "rect" as const, x: 0, y: 0, w: 100, h: 100, fill: "#112233" as const }] },
  sizePct: 20,
  marginModules: 1,
  color: null,
  fileName: "logo.svg",
};

describe("esquema del estilo", () => {
  it("el estilo por defecto es válido y es el QR clásico", () => {
    expect(QrStyleSchema.parse(DEFAULT_QR_STYLE)).toEqual(DEFAULT_QR_STYLE);
    expect(isDefaultQrStyle(DEFAULT_QR_STYLE)).toBe(true);
  });

  it("cualquier cambio deja de ser el QR clásico", () => {
    expect(isDefaultQrStyle(style({ modules: "dots" }))).toBe(false);
    expect(isDefaultQrStyle(style({ outline: "circle" }))).toBe(false);
    expect(isDefaultQrStyle(style({ colors: { ...DEFAULT_QR_STYLE.colors, background: "#FFFFFF" } }))).toBe(false);
    expect(isDefaultQrStyle(style({ logo: LOGO }))).toBe(false);
  });

  it("un proyecto anterior sin qrStyle se hidrata con el estilo clásico", () => {
    const parsed = TemplateOverridesSchema.parse({ items: {}, qr: {}, tile: {} });
    expect(parsed.qrStyle).toEqual(DEFAULT_QR_STYLE);
    expect(EMPTY_TEMPLATE_OVERRIDES.qrStyle).toEqual(DEFAULT_QR_STYLE);
  });

  it("rechaza formas desconocidas, colores no hex y logos fuera de rango", () => {
    expect(QrStyleSchema.safeParse({ ...DEFAULT_QR_STYLE, modules: "star" }).success).toBe(false);
    expect(QrStyleSchema.safeParse({ ...DEFAULT_QR_STYLE, colors: { ...DEFAULT_QR_STYLE.colors, modules: "red" } }).success).toBe(false);
    expect(QrStyleSchema.safeParse({ ...DEFAULT_QR_STYLE, logo: { ...LOGO, sizePct: 80 } }).success).toBe(false);
    expect(QrStyleSchema.safeParse({ ...DEFAULT_QR_STYLE, logo: { ...LOGO, marginModules: 9 } }).success).toBe(false);
  });
});

describe("formas", () => {
  it("todos los paths usan solo M, L, C y Z absolutos (los admite scalePath, pdfkit e Illustrator)", () => {
    for (const modules of QR_MODULE_SHAPES) {
      for (const eye of QR_EYE_FRAME_SHAPES) {
        const out = styleQrPaths(MATRIX, style({ modules, eyeFrame: eye, eyeBall: eye }), PLACE);
        for (const d of [out.modules, out.eyeFrame, out.eyeBall]) {
          expect(d).not.toBe("");
          expect(d).toMatch(/^[MLCZ0-9.\-\s]+$/);
          expect(d).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it("todo cae dentro de la matriz (nada se sale del QR)", () => {
    for (const modules of QR_MODULE_SHAPES) {
      const out = styleQrPaths(MATRIX, style({ modules, eyeFrame: "circle", eyeBall: "circle" }), PLACE);
      const numbers = [out.modules, out.eyeFrame, out.eyeBall].flatMap((d) => d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(N);
    }
  });

  it("los patrones de posición no se dibujan como módulos (van aparte)", () => {
    const body = bodyMatrix(MATRIX, null);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inFinder(x, y, N)) expect(body[y]?.[x]).toBe(false);
    expect(MATRIX[0]?.[0]).toBe(true); // la matriz original sí los trae
  });

  it("«cuadrado» conserva los módulos de datos: mismos contornos que el QR clásico para esa matriz", () => {
    const loop = [[0, 0], [2, 0], [2, 1], [0, 1]] as const;
    expect(roundedLoop(loop, 0, 0).map((c) => c[0]).join("")).toBe("MLLLZ");
  });

  it("redondear una esquina añade una curva por esquina convexa y respeta el límite de medio módulo", () => {
    const square = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
    const cmds = roundedLoop(square, 0.5, 0.5);
    expect(cmds.filter((c) => c[0] === "C")).toHaveLength(4);
    const xs = cmds.flatMap((c) => (c[0] === "Z" ? [] : c.slice(1).flatMap((p) => (p as readonly number[])[0] as number)));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    // con un radio absurdo se limita a la mitad del lado
    const clamped = roundedLoop(square, 5, 5);
    const clampedXs = clamped.flatMap((c) => (c[0] === "Z" ? [] : c.slice(1).map((p) => (p as readonly number[])[0] as number)));
    expect(Math.min(...clampedXs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...clampedXs)).toBeLessThanOrEqual(1);
  });

  it("los puntos y las hojas generan una forma por módulo oscuro de datos", () => {
    const dark = bodyMatrix(MATRIX, null).flat().filter(Boolean).length;
    for (const shape of ["dots", "classy", "classy-rounded"] as const) {
      const d = styleQrPaths(MATRIX, style({ modules: shape }), PLACE).modules;
      expect((d.match(/M/g) ?? []).length).toBe(dark);
    }
  });

  it("cada forma de esquina produce 3 patrones de posición (3 marcos y 3 pupilas)", () => {
    for (const eye of QR_EYE_BALL_SHAPES) {
      const out = styleQrPaths(MATRIX, style({ eyeFrame: eye, eyeBall: eye }), PLACE);
      expect((out.eyeFrame.match(/M/g) ?? []).length).toBe(6); // anillo = contorno + hueco, por 3
      expect((out.eyeBall.match(/M/g) ?? []).length).toBe(3);
    }
  });

  it("el origen y el tamaño del módulo se aplican al path", () => {
    const place = { x: 10, y: 20, module: 0.5, decimals: 3 };
    const out = styleQrPaths(MATRIX, style(), place);
    expect(out.eyeBall).toContain("M11 21"); // pupila: celda (2,2) → 10 + 2 · 0.5, 20 + 2 · 0.5
  });
});

describe("logo", () => {
  it("despeja los módulos del centro y nunca toca los patrones de posición", () => {
    const withLogo = styleQrPaths(MATRIX, style({ logo: LOGO }), PLACE);
    const without = styleQrPaths(MATRIX, style(), PLACE);
    expect(withLogo.modules.length).toBeLessThan(without.modules.length);
    expect(withLogo.eyeFrame).toBe(without.eyeFrame);
    expect(withLogo.eyeBall).toBe(without.eyeBall);
    const placement = logoPlacement(N, LOGO);
    const body = bodyMatrix(MATRIX, placement.hole);
    for (let y = Math.ceil(placement.hole.y0); y < Math.floor(placement.hole.y1); y++) {
      for (let x = Math.ceil(placement.hole.x0); x < Math.floor(placement.hole.x1); x++) expect(body[y]?.[x]).toBe(false);
    }
  });

  it("el logo queda centrado y su lado es el porcentaje pedido", () => {
    const placement = logoPlacement(N, { ...LOGO, sizePct: 20, marginModules: 0 });
    expect(placement.cx).toBe(N / 2);
    expect(placement.side).toBeCloseTo(N * 0.2);
    expect(placement.coverage).toBeCloseTo(0.04);
  });

  it("el hueco del logo más sus márgenes no alcanza los patrones de posición con el tamaño máximo", () => {
    const placement = logoPlacement(N, { ...LOGO, sizePct: 30, marginModules: 0 });
    expect(placement.cx - placement.side / 2).toBeGreaterThan(FINDER);
  });

  it("recolorLogo pinta todo de un color y conserva los rellenos «none»", () => {
    const nodes = [
      { type: "rect" as const, x: 0, y: 0, w: 1, h: 1, fill: "#112233" as const },
      { type: "path" as const, d: "M0 0L1 0L1 1Z", fill: "none" as const, fillRule: "nonzero" as const, stroke: "#445566" as const, strokeWidth: 2 },
    ];
    const recolored = recolorLogo(nodes, "#FF0000");
    expect(recolored[0]).toMatchObject({ fill: "#FF0000" });
    expect(recolored[1]).toMatchObject({ fill: "none", stroke: "#FF0000" });
    expect(recolorLogo(nodes, null)).toEqual(nodes);
  });
});

describe("colocación y colores", () => {
  const box = { x: 5, y: 7, width: 24.788 };

  it("cuadrado: igual que siempre (lado / (módulos + 2 · silencio))", () => {
    const placement = qrPlacement(box, 25, 0, "square");
    expect(placement.moduleMm).toBeCloseTo(24.788 / 25);
    expect(placement.originX).toBe(5);
    const quiet = qrPlacement(box, 25, 4, "square");
    expect(quiet.moduleMm).toBeCloseTo(24.788 / 33);
    expect(quiet.originX).toBeCloseTo(5 + 4 * quiet.moduleMm);
  });

  it("circular: la matriz se inscribe en el círculo con zona de silencio y queda centrada", () => {
    const placement = qrPlacement(box, 25, 0, "circle");
    const side = 25 * placement.moduleMm;
    const diagonal = (side + 2 * CIRCLE_QUIET_MODULES * placement.moduleMm) * Math.SQRT2;
    expect(diagonal).toBeCloseTo(24.788);
    expect(placement.originX + side / 2).toBeCloseTo(box.x + box.width / 2);
    expect(placement.originY + side / 2).toBeCloseTo(box.y + box.width / 2);
  });

  it("sin color propio hereda los de la plantilla; marcos y pupilas heredan del anterior", () => {
    const base = { dark: "#000000", light: "#FFFFFF" } as const;
    expect(resolveStyleColors(DEFAULT_QR_STYLE, base)).toEqual({ modules: "#000000", eyeFrame: "#000000", eyeBall: "#000000", background: "#FFFFFF" });
    const colors = resolveStyleColors(style({ colors: { modules: "#112233", eyeFrame: "#AA0000", eyeBall: null, background: "#FFFFEE" } }), base);
    expect(colors).toEqual({ modules: "#112233", eyeFrame: "#AA0000", eyeBall: "#AA0000", background: "#FFFFEE" });
  });
});

describe("avisos de legibilidad", () => {
  const colors = (patch: Partial<ReturnType<typeof resolveStyleColors>> = {}) => ({
    modules: "#000000" as const,
    eyeFrame: "#000000" as const,
    eyeBall: "#000000" as const,
    background: "#FFFFFF" as const,
    ...patch,
  });

  it("calcula el contraste WCAG", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("negro sobre blanco no genera avisos", () => {
    expect(qrStyleWarnings(DEFAULT_QR_STYLE, colors(), N)).toEqual([]);
  });

  it("poco contraste avisa, contraste casi nulo bloquea", () => {
    expect(qrStyleWarnings(DEFAULT_QR_STYLE, colors({ modules: "#888888" }), N)).toContainEqual(expect.objectContaining({ code: "QR_STYLE_LOW_CONTRAST", part: "modules", level: "warn" }));
    expect(qrStyleWarnings(DEFAULT_QR_STYLE, colors({ modules: "#EEEEEE" }), N)).toContainEqual(expect.objectContaining({ code: "QR_STYLE_LOW_CONTRAST", part: "modules", level: "block" }));
  });

  it("detecta cada parte por separado", () => {
    const warnings = qrStyleWarnings(DEFAULT_QR_STYLE, colors({ eyeFrame: "#F0F0F0" }), N);
    expect(warnings.map((w) => ("part" in w ? w.part : null))).toEqual(["eyeFrame"]);
  });

  it("un QR claro sobre fondo oscuro con buen contraste avisa de que está invertido", () => {
    const warnings = qrStyleWarnings(DEFAULT_QR_STYLE, colors({ modules: "#FFFFFF", eyeFrame: "#FFFFFF", eyeBall: "#FFFFFF", background: "#000000" }), N);
    expect(warnings.every((w) => w.code === "QR_STYLE_INVERTED")).toBe(true);
    expect(warnings).toHaveLength(3);
  });

  it("un logo que tapa demasiado avisa y, pasado el límite de la corrección, bloquea", () => {
    expect(qrStyleWarnings(style({ logo: { ...LOGO, sizePct: 10, marginModules: 0 } }), colors(), N)).toEqual([]);
    expect(qrStyleWarnings(style({ logo: { ...LOGO, sizePct: 30, marginModules: 3 } }), colors(), 21)).toContainEqual(expect.objectContaining({ code: "QR_STYLE_LOGO_LARGE", level: "block" }));
    const mid = qrStyleWarnings(style({ logo: { ...LOGO, sizePct: 30, marginModules: 2 } }), colors(), 25);
    expect(mid).toContainEqual(expect.objectContaining({ code: "QR_STYLE_LOGO_LARGE", level: "warn" }));
  });
});
