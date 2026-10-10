/**
 * Formas vectoriales del QR con estilo. Todo se calcula en MÓDULOS (1 módulo = 1)
 * y se emite como paths absolutos con solo M, L, C y Z: así los entienden el SVG
 * por pieza (scalePath), pdfkit e Illustrator sin comandos de arco ni relativos.
 */
import { matrixToContours } from "@/lib/qr/matrix-to-path";
import type { QrMatrix } from "@/types";

export type Point = readonly [number, number];
export type Cmd = readonly ["M" | "L", Point] | readonly ["C", Point, Point, Point] | readonly ["Z"];

/** Constante de la aproximación de un cuarto de círculo con una cúbica de Bézier. */
const KAPPA = 0.5522847498307936;

export interface Placement {
  /** Esquina superior izquierda de la matriz y lado de un módulo, en las unidades de salida (mm). */
  x: number;
  y: number;
  module: number;
  /** Decimales (3 = micras). */
  decimals: number;
}

const fmt = (n: number, decimals: number): string => {
  const rounded = Number(n.toFixed(decimals));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/** Serializa comandos en módulos a un path `d` en las unidades de salida. */
export function toPath(commands: readonly Cmd[], place: Placement): string {
  const at = (p: Point) => `${fmt(place.x + p[0] * place.module, place.decimals)} ${fmt(place.y + p[1] * place.module, place.decimals)}`;
  return commands
    .map((cmd) => {
      if (cmd[0] === "Z") return "Z";
      if (cmd[0] === "C") return `C${at(cmd[1])} ${at(cmd[2])} ${at(cmd[3])}`;
      return `${cmd[0]}${at(cmd[1])}`;
    })
    .join("");
}

const minus = (a: Point, b: Point, k: number): Point => [a[0] - b[0] * k, a[1] - b[1] * k];
const plus = (a: Point, b: Point, k: number): Point => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Cuarto de círculo (cúbica) de `from` a `to`, saliendo en la dirección `d1` y entrando en `d2`. */
function corner(from: Point, to: Point, d1: Point, d2: Point, r: number): Cmd {
  return ["C", plus(from, d1, r * KAPPA), minus(to, d2, r * KAPPA), to];
}

/**
 * Contorno cerrado con las esquinas redondeadas. `radius` va en módulos y se
 * limita a la mitad del lado más corto: los lados son de ≥ 1 módulo, así que
 * 0.5 es el máximo y dos esquinas contiguas nunca se pisan.
 *
 * Sentido del contorno (matrixToContours): los exteriores van en sentido horario
 * y los huecos en antihorario, con el relleno siempre a la derecha. Por eso un
 * giro a la derecha es una esquina CONVEXA del relleno y uno a la izquierda una
 * CÓNCAVA (rincón interior).
 */
export function roundedLoop(loop: readonly Point[], convex: number, concave: number): Cmd[] {
  const n = loop.length;
  if (n < 3 || (convex <= 0 && concave <= 0)) {
    return [...loop.map((p, i): Cmd => [i === 0 ? "M" : "L", p]), ["Z"]];
  }
  const unit = (a: Point, b: Point): Point => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const corners = loop.map((v, i) => {
    const prev = loop[(i + n - 1) % n] as Point;
    const next = loop[(i + 1) % n] as Point;
    const d1 = unit(prev, v);
    const d2 = unit(v, next);
    const turnsRight = d1[0] * d2[1] - d1[1] * d2[0] > 0;
    const wanted = turnsRight ? convex : concave;
    const limit = Math.min(Math.hypot(v[0] - prev[0], v[1] - prev[1]), Math.hypot(next[0] - v[0], next[1] - v[1])) / 2;
    const r = Math.min(wanted, limit);
    return { v, d1, d2, r, start: minus(v, d1, r), end: plus(v, d2, r) };
  });
  const commands: Cmd[] = [["M", corners[0]!.end]];
  for (let i = 1; i <= n; i++) {
    const c = corners[i % n]!;
    commands.push(["L", c.start]);
    if (c.r > 0) commands.push(corner(c.start, c.end, c.d1, c.d2, c.r));
  }
  commands.push(["Z"]);
  return commands;
}

/** Radios por esquina: arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. */
export type Radii = readonly [number, number, number, number];

/** Rectángulo con esquinas redondeadas. `reverse` lo traza en sentido antihorario (huecos). */
export function roundedRect(x: number, y: number, w: number, h: number, radii: Radii, reverse = false): Cmd[] {
  const [tl, tr, br, bl] = radii;
  const R: Point = [1, 0];
  const D: Point = [0, 1];
  const L: Point = [-1, 0];
  const U: Point = [0, -1];
  if (!reverse) {
    return [
      ["M", [x + tl, y]],
      ["L", [x + w - tr, y]],
      ...(tr > 0 ? [corner([x + w - tr, y], [x + w, y + tr], R, D, tr)] : []),
      ["L", [x + w, y + h - br]],
      ...(br > 0 ? [corner([x + w, y + h - br], [x + w - br, y + h], D, L, br)] : []),
      ["L", [x + bl, y + h]],
      ...(bl > 0 ? [corner([x + bl, y + h], [x, y + h - bl], L, U, bl)] : []),
      ["L", [x, y + tl]],
      ...(tl > 0 ? [corner([x, y + tl], [x + tl, y], U, R, tl)] : []),
      ["Z"],
    ];
  }
  return [
    ["M", [x + tl, y]],
    ...(tl > 0 ? [corner([x + tl, y], [x, y + tl], L, D, tl)] : []),
    ["L", [x, y + h - bl]],
    ...(bl > 0 ? [corner([x, y + h - bl], [x + bl, y + h], D, R, bl)] : []),
    ["L", [x + w - br, y + h]],
    ...(br > 0 ? [corner([x + w - br, y + h], [x + w, y + h - br], R, U, br)] : []),
    ["L", [x + w, y + tr]],
    ...(tr > 0 ? [corner([x + w, y + tr], [x + w - tr, y], U, L, tr)] : []),
    ["Z"],
  ];
}

const circle = (cx: number, cy: number, r: number, reverse = false): Cmd[] => roundedRect(cx - r, cy - r, 2 * r, 2 * r, [r, r, r, r], reverse);

export type ModuleShape = "square" | "rounded" | "extra-rounded" | "dots" | "classy" | "classy-rounded";
export type EyeShape = "square" | "rounded" | "circle";

/** Radio de las esquinas exteriores de los módulos fundidos, en módulos. */
const ROUNDED = { convex: 0.34, concave: 0 } as const;
const EXTRA_ROUNDED = { convex: 0.5, concave: 0.5 } as const;

/** Lado del patrón de posición (finder) en módulos. */
export const FINDER = 7;

/** Esquinas (x, y) de los tres patrones de posición. */
export const finderOrigins = (modules: number): Point[] => [
  [0, 0],
  [modules - FINDER, 0],
  [0, modules - FINDER],
];

/** ¿La celda (x, y) cae dentro de alguno de los tres patrones de posición? */
export const inFinder = (x: number, y: number, modules: number): boolean =>
  finderOrigins(modules).some(([fx, fy]) => x >= fx && x < fx + FINDER && y >= fy && y < fy + FINDER);

/** Matriz sin los patrones de posición (se dibujan aparte) ni los módulos que tapa el logo. */
export function bodyMatrix(matrix: QrMatrix, hole: { x0: number; y0: number; x1: number; y1: number } | null): QrMatrix {
  const n = matrix.length;
  return matrix.map((row, y) =>
    row.map((dark, x) => {
      if (!dark || inFinder(x, y, n)) return false;
      if (hole && x + 1 > hole.x0 && x < hole.x1 && y + 1 > hole.y0 && y < hole.y1) return false;
      return true;
    }),
  );
}

/** Módulos de datos con la forma elegida: UN solo path compuesto (relleno no cero, sentidos coherentes). */
export function moduleCommands(matrix: QrMatrix, shape: ModuleShape): Cmd[] {
  if (shape === "square" || shape === "rounded" || shape === "extra-rounded") {
    const radii = shape === "square" ? { convex: 0, concave: 0 } : shape === "rounded" ? ROUNDED : EXTRA_ROUNDED;
    return matrixToContours(matrix).flatMap((loop) => roundedLoop(loop, radii.convex, radii.concave));
  }
  const commands: Cmd[] = [];
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      if (shape === "dots") commands.push(...circle(x + 0.5, y + 0.5, 0.5));
      // «classy»: hoja (esquinas opuestas redondeadas); «classy-rounded»: además suaviza las otras dos.
      else if (shape === "classy") commands.push(...roundedRect(x, y, 1, 1, [0.5, 0, 0.5, 0]));
      else commands.push(...roundedRect(x, y, 1, 1, [0.5, 0.18, 0.5, 0.18]));
    }),
  );
  return commands;
}

/** Marco del patrón de posición (anillo de 7×7 con grosor de 1 módulo) en la celda (fx, fy). */
export function eyeFrameCommands(fx: number, fy: number, shape: EyeShape): Cmd[] {
  const outer = shape === "square" ? 0 : shape === "rounded" ? 2.4 : 3.5;
  const inner = shape === "square" ? 0 : shape === "rounded" ? 1.4 : 2.5;
  return [
    ...roundedRect(fx, fy, FINDER, FINDER, [outer, outer, outer, outer]),
    ...roundedRect(fx + 1, fy + 1, FINDER - 2, FINDER - 2, [inner, inner, inner, inner], true),
  ];
}

/** Pupila del patrón de posición (3×3 centrado). */
export function eyeBallCommands(fx: number, fy: number, shape: EyeShape): Cmd[] {
  const r = shape === "square" ? 0 : shape === "rounded" ? 0.95 : 1.5;
  return roundedRect(fx + 2, fy + 2, 3, 3, [r, r, r, r]);
}
