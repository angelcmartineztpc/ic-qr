import type { QrMatrix } from "@/types";

type Point = readonly [number, number];

/**
 * Contorno del QR como UN solo path compuesto (ideal para Illustrator y CAM
 * de grabado: sin cientos de rectángulos sueltos ni costuras entre módulos).
 *
 * Se recorre el borde de cada módulo oscuro en sentido horario (y hacia abajo);
 * las aristas compartidas entre módulos oscuros contiguos se anulan y las
 * restantes se encadenan en bucles cerrados: los exteriores quedan en sentido
 * horario y los huecos en antihorario, de modo que nonzero y even-odd dan el
 * mismo resultado. En vértices en silla (módulos en diagonal) se gira a la
 * derecha para mantener separados los módulos diagonales.
 */
export function matrixToContours(matrix: QrMatrix): Point[][] {
  const edges = new Map<string, Point>(); // arista "x1,y1>x2,y2" → [x1,y1] (la clave identifica la dirección)
  const key = (a: Point, b: Point) => `${a[0]},${a[1]}>${b[0]},${b[1]}`;
  const add = (a: Point, b: Point) => {
    const opposite = key(b, a);
    if (edges.has(opposite)) edges.delete(opposite);
    else edges.set(key(a, b), a);
  };

  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      add([x, y], [x + 1, y]);
      add([x + 1, y], [x + 1, y + 1]);
      add([x + 1, y + 1], [x, y + 1]);
      add([x, y + 1], [x, y]);
    }),
  );

  // Aristas salientes por vértice.
  const outgoing = new Map<string, Array<{ from: Point; to: Point; used: boolean }>>();
  for (const k of edges.keys()) {
    const [from, to] = k.split(">").map((p) => p.split(",").map(Number)) as [number[], number[]];
    const edge = { from: [from[0] ?? 0, from[1] ?? 0] as Point, to: [to[0] ?? 0, to[1] ?? 0] as Point, used: false };
    const list = outgoing.get(`${edge.from[0]},${edge.from[1]}`);
    if (list) list.push(edge);
    else outgoing.set(`${edge.from[0]},${edge.from[1]}`, [edge]);
  }

  // Giro a la derecha (con y hacia abajo y sentido horario): prioridad derecha > recto > izquierda.
  const turnRank = (dir: Point, next: Point): number => {
    const cross = dir[0] * next[1] - dir[1] * next[0]; // >0: gira a la derecha en pantalla
    return cross > 0 ? 0 : cross === 0 ? 1 : 2;
  };

  const contours: Point[][] = [];
  const ordered = [...outgoing.values()].flat().sort((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0]);
  for (const start of ordered) {
    if (start.used) continue;
    const loop: Point[] = [];
    let edge = start;
    for (;;) {
      edge.used = true;
      loop.push(edge.from);
      const dir: Point = [edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]];
      const candidates = (outgoing.get(`${edge.to[0]},${edge.to[1]}`) ?? []).filter((c) => !c.used || c === start);
      if (candidates.length === 0) break;
      candidates.sort((a, b) => turnRank(dir, [a.to[0] - a.from[0], a.to[1] - a.from[1]]) - turnRank(dir, [b.to[0] - b.from[0], b.to[1] - b.from[1]]));
      const next = candidates[0];
      if (!next || next === start) break;
      edge = next;
    }
    contours.push(simplify(loop));
  }
  return contours;
}

/** Quita vértices colineales (los giros reales son esquinas). */
function simplify(points: Point[]): Point[] {
  return points.filter((point, i) => {
    const prev = points[(i + points.length - 1) % points.length] as Point;
    const next = points[(i + 1) % points.length] as Point;
    return (point[0] - prev[0]) * (next[1] - point[1]) !== (point[1] - prev[1]) * (next[0] - point[0]);
  });
}

export interface PathPlacement {
  /** Origen (esquina superior izquierda de la matriz) y tamaño de un módulo, en las unidades de salida. */
  x: number;
  y: number;
  module: number;
  /** Decimales (3 = micras si la unidad es mm). */
  decimals: number;
}

const fmt = (n: number, decimals: number): string => {
  const rounded = Number(n.toFixed(decimals));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/** Path `d` con solo M, L y Z absolutos. */
export function matrixToPath(matrix: QrMatrix, place: PathPlacement): string {
  return matrixToContours(matrix)
    .map((loop) => {
      const [first, ...rest] = loop;
      if (!first) return "";
      const at = (p: Point) => `${fmt(place.x + p[0] * place.module, place.decimals)} ${fmt(place.y + p[1] * place.module, place.decimals)}`;
      return `M${at(first)}${rest.map((p) => `L${at(p)}`).join("")}Z`;
    })
    .join("");
}
