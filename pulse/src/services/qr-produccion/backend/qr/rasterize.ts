/**
 * Rasterizador mínimo de la geometría saneada de un QR externo (rects y paths con
 * relleno o trazo). Sustituye a `sharp`, que no existe en Deno/Edge Functions: es
 * TypeScript puro, determinista y sin WASM. Solo hace falta lo que el decodificador
 * necesita (blanco y negro nítidos), no un renderer SVG completo: sin antialiasing,
 * sin uniones ni remates de trazo (cada segmento es un rectángulo), sin degradados.
 */
import type { ExternalGeometry } from "@/services/qr-produccion/schemas/qr-geometry";

type Pt = [number, number];
type Matrix = readonly [number, number, number, number, number, number];
type Node = ExternalGeometry["nodes"][number];

export interface Raster {
  width: number;
  height: number;
  /** RGBA (gris opaco). */
  data: Uint8ClampedArray;
}

const SEGMENTS_PER_CURVE = 12;
/** Tope de vértices por trazado: acota CPU y memoria ante un SVG hostil que cumple el schema. */
export const MAX_POINTS = 400_000;

// ---------- path → subtrazados ----------

interface Subpath {
  points: Pt[];
  closed: boolean;
}

class PathReader {
  i = 0;
  constructor(private readonly d: string) {}
  private skip(): void {
    while (this.i < this.d.length && /[\s,]/.test(this.d[this.i] as string)) this.i++;
  }
  command(): string | null {
    this.skip();
    const ch = this.d[this.i];
    if (ch !== undefined && /[A-Za-z]/.test(ch)) {
      this.i++;
      return ch;
    }
    return null;
  }
  hasNumber(): boolean {
    this.skip();
    const ch = this.d[this.i];
    return ch !== undefined && /[-+.\d]/.test(ch);
  }
  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.d.slice(this.i, this.i + 40));
    if (!m) throw new Error("número esperado en el path");
    this.i += m[0].length;
    return Number(m[0]);
  }
  /** Las banderas del arco pueden ir pegadas («a1 1 0 011 1»): un solo carácter 0/1. */
  flag(): number {
    this.skip();
    const ch = this.d[this.i++];
    if (ch !== "0" && ch !== "1") throw new Error("bandera de arco esperada");
    return Number(ch);
  }
}

function arcPoints(from: Pt, rx: number, ry: number, rotation: number, large: number, sweep: number, to: Pt): Pt[] {
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) return [to];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1) / ry;
  const cyp = (-factor * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2;
  const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil((Math.abs(delta) / (2 * Math.PI)) * 48));
  const out: Pt[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = theta + (delta * s) / steps;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  out[out.length - 1] = to;
  return out;
}

const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt[] =>
  Array.from({ length: SEGMENTS_PER_CURVE }, (_, k): Pt => {
    const t = (k + 1) / SEGMENTS_PER_CURVE;
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  });

const quadratic = (p0: Pt, p1: Pt, p2: Pt): Pt[] => cubic(p0, [p0[0] + (2 / 3) * (p1[0] - p0[0]), p0[1] + (2 / 3) * (p1[1] - p0[1])], [p2[0] + (2 / 3) * (p1[0] - p2[0]), p2[1] + (2 / 3) * (p1[1] - p2[1])], p2);

/** Convierte el atributo `d` en subtrazados de segmentos rectos. Lanza si el path no se puede leer. */
export function flattenPath(d: string): Subpath[] {
  const reader = new PathReader(d);
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let pos: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCubicCtrl: Pt | null = null;
  let lastQuadCtrl: Pt | null = null;
  let command = "";
  let total = 0;

  const begin = (at: Pt) => {
    current = { points: [at], closed: false };
    subpaths.push(current);
    start = at;
  };
  const add = (points: Pt[]) => {
    if (!current) begin(pos);
    (current as Subpath).points.push(...points);
    total += points.length;
    if (total > MAX_POINTS) throw new Error("el path tiene demasiados vértices");
    pos = points[points.length - 1] as Pt;
  };

  for (;;) {
    const next = reader.command();
    if (next !== null) command = next;
    else if (!reader.hasNumber()) break;
    else if (command === "Z" || command === "z") throw new Error("números tras «Z»");
    else if (command === "") throw new Error("el path debe empezar con un comando");
    else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    if (command === "") break;

    const rel = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const ox = rel ? pos[0] : 0;
    const oy = rel ? pos[1] : 0;
    let cubicCtrl: Pt | null = null;
    let quadCtrl: Pt | null = null;
    switch (upper) {
      case "M": {
        const p: Pt = [reader.number() + ox, reader.number() + oy];
        begin(p);
        pos = p;
        break;
      }
      case "L":
        add([[reader.number() + ox, reader.number() + oy]]);
        break;
      case "H":
        add([[reader.number() + ox, pos[1]]]);
        break;
      case "V":
        add([[pos[0], reader.number() + oy]]);
        break;
      case "C": {
        const p1: Pt = [reader.number() + ox, reader.number() + oy];
        const p2: Pt = [reader.number() + ox, reader.number() + oy];
        const p3: Pt = [reader.number() + ox, reader.number() + oy];
        add(cubic(pos, p1, p2, p3));
        cubicCtrl = p2;
        break;
      }
      case "S": {
        const p1: Pt = lastCubicCtrl ? [2 * pos[0] - lastCubicCtrl[0], 2 * pos[1] - lastCubicCtrl[1]] : pos;
        const p2: Pt = [reader.number() + ox, reader.number() + oy];
        const p3: Pt = [reader.number() + ox, reader.number() + oy];
        add(cubic(pos, p1, p2, p3));
        cubicCtrl = p2;
        break;
      }
      case "Q": {
        const p1: Pt = [reader.number() + ox, reader.number() + oy];
        const p2: Pt = [reader.number() + ox, reader.number() + oy];
        add(quadratic(pos, p1, p2));
        quadCtrl = p1;
        break;
      }
      case "T": {
        const p1: Pt = lastQuadCtrl ? [2 * pos[0] - lastQuadCtrl[0], 2 * pos[1] - lastQuadCtrl[1]] : pos;
        const p2: Pt = [reader.number() + ox, reader.number() + oy];
        add(quadratic(pos, p1, p2));
        quadCtrl = p1;
        break;
      }
      case "A": {
        const rx = reader.number();
        const ry = reader.number();
        const rotation = reader.number();
        const large = reader.flag();
        const sweep = reader.flag();
        const to: Pt = [reader.number() + ox, reader.number() + oy];
        add(arcPoints(pos, rx, ry, rotation, large, sweep, to));
        break;
      }
      case "Z":
        if (current) (current as Subpath).closed = true;
        pos = start;
        current = null; // lo siguiente (si no es M) empieza en el punto inicial
        break;
      default:
        throw new Error(`comando no admitido: ${command}`);
    }
    lastCubicCtrl = cubicCtrl;
    lastQuadCtrl = quadCtrl;
  }
  return subpaths;
}

// ---------- relleno por líneas de barrido ----------

class Surface {
  readonly gray: Uint8Array;
  constructor(
    readonly size: number,
    background = 255,
  ) {
    this.gray = new Uint8Array(size * size).fill(background);
  }

  /** Rellena polígonos (en píxeles) con la regla dada y pinta con `luma`. Cruces en el centro del píxel. */
  fill(polygons: readonly (readonly Pt[])[], rule: "nonzero" | "evenodd", luma: number): void {
    const rows: Array<number[] | undefined> = new Array(this.size);
    for (const poly of polygons) {
      const n = poly.length;
      if (n < 3) continue;
      for (let k = 0; k < n; k++) {
        const [x0, y0] = poly[k] as Pt;
        const [x1, y1] = poly[(k + 1) % n] as Pt;
        if (y0 === y1) continue;
        const dir = y0 < y1 ? 1 : -1;
        const [ya, yb, xa, xb] = y0 < y1 ? [y0, y1, x0, x1] : [y1, y0, x1, x0];
        const first = Math.max(0, Math.ceil(ya - 0.5));
        const last = Math.min(this.size - 1, Math.ceil(yb - 0.5) - 1);
        for (let y = first; y <= last; y++) {
          const x = xa + ((y + 0.5 - ya) * (xb - xa)) / (yb - ya);
          (rows[y] ??= []).push(x, dir);
        }
      }
    }
    for (let y = 0; y < this.size; y++) {
      const crossings = rows[y];
      if (!crossings) continue;
      const pairs: Array<[number, number]> = [];
      for (let k = 0; k < crossings.length; k += 2) pairs.push([crossings[k] as number, crossings[k + 1] as number]);
      pairs.sort((a, b) => a[0] - b[0]);
      let winding = 0;
      for (let k = 0; k < pairs.length - 1; k++) {
        winding += rule === "evenodd" ? 1 : (pairs[k] as [number, number])[1];
        const inside = rule === "evenodd" ? winding % 2 !== 0 : winding !== 0;
        if (!inside) continue;
        const from = Math.max(0, Math.ceil((pairs[k] as [number, number])[0] - 0.5));
        const to = Math.min(this.size - 1, Math.ceil((pairs[k + 1] as [number, number])[0] - 0.5) - 1);
        for (let x = from; x <= to; x++) this.gray[y * this.size + x] = luma;
      }
    }
  }
}

const apply = (m: Matrix, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** Luminosidad 0–255 de `#RRGGBB`. */
export function lumaOf(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
}

const signedArea = (poly: readonly Pt[]): number => poly.reduce((sum, [x0, y0], k) => {
  const [x1, y1] = poly[(k + 1) % poly.length] as Pt;
  return sum + (x0 * y1 - x1 * y0);
}, 0);

/** Rectángulos de trazo (sin remates ni uniones), todos con la misma orientación para que `nonzero` los una. */
function strokeQuads(subpaths: Subpath[], width: number, m: Matrix): Pt[][] {
  const quads: Pt[][] = [];
  const half = width / 2;
  for (const sub of subpaths) {
    const pts = sub.closed ? [...sub.points, sub.points[0] as Pt] : sub.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [a, b] = [pts[k] as Pt, pts[k + 1] as Pt];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      const nx = (-(b[1] - a[1]) / len) * half;
      const ny = ((b[0] - a[0]) / len) * half;
      const quad = ([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]] as Pt[]).map((p) => apply(m, p));
      quads.push(signedArea(quad) < 0 ? quad.reverse() : quad);
    }
  }
  return quads;
}

function paintNode(surface: Surface, node: Node, base: Matrix): void {
  const m = node.transform ? multiply(base, node.transform) : base;
  if (node.type === "rect") {
    if (node.w <= 0 || node.h <= 0) return;
    const quad = ([[node.x, node.y], [node.x + node.w, node.y], [node.x + node.w, node.y + node.h], [node.x, node.y + node.h]] as Pt[]).map((p) => apply(m, p));
    surface.fill([quad], "nonzero", lumaOf(node.fill));
    return;
  }
  const subpaths = flattenPath(node.d);
  if (node.fill !== "none") surface.fill(subpaths.map((s) => s.points.map((p) => apply(m, p))), node.fillRule, lumaOf(node.fill));
  if (node.stroke && (node.strokeWidth ?? 1) > 0) surface.fill(strokeQuads(subpaths, node.strokeWidth ?? 1, m), "nonzero", lumaOf(node.stroke));
}

/**
 * Dibuja la geometría sobre fondo blanco y con una zona de silencio generosa
 * (misma composición que `externalGeometryToSvg`, que es lo que antes rasterizaba sharp).
 * Lanza si algún path no se puede leer: quien llama lo trata como «sin QR legible».
 */
export function rasterizeGeometry(geometry: ExternalGeometry, options: { sizePx: number; paddingRatio?: number }): Raster {
  const [vx, vy, vw, vh] = geometry.viewBox;
  const side = Math.max(vw, vh);
  const pad = side * (options.paddingRatio ?? 0.12);
  const scale = options.sizePx / (side + 2 * pad);
  const base: Matrix = [scale, 0, 0, scale, (pad - vx) * scale, (pad - vy) * scale];
  const surface = new Surface(options.sizePx);
  for (const node of geometry.nodes) paintNode(surface, node, base);

  const data = new Uint8ClampedArray(options.sizePx * options.sizePx * 4);
  surface.gray.forEach((g, i) => {
    data[i * 4] = g;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = g;
    data[i * 4 + 3] = 255;
  });
  return { width: options.sizePx, height: options.sizePx, data };
}
