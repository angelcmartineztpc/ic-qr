/**
 * Rasterizador mínimo SOLO PARA PRUEBAS: dibuja un path con M/L/Z absolutos
 * (como los que genera lib/qr) para decodificarlo con un lector real. Nunca se
 * usa en producción: los documentos finales no pasan por ningún raster.
 */
type Pt = [number, number];

export function parsePolygons(d: string): Pt[][] {
  const polygons: Pt[][] = [];
  let current: Pt[] = [];
  for (const match of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    const [, command, args] = match;
    if (command === "Z") {
      if (current.length > 0) polygons.push(current);
      current = [];
      continue;
    }
    const [x, y] = (args ?? "").trim().split(/\s+/).map(Number);
    if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) throw new Error(`Path no soportado: ${match[0]}`);
    if (command === "M") current = [];
    current.push([x, y]);
  }
  return polygons;
}

/** Número de vueltas (nonzero) y de cruces (even-odd) de un punto respecto a los polígonos. */
export function windingAt(polygons: Pt[][], px: number, py: number): { winding: number; crossings: number } {
  let winding = 0;
  let crossings = 0;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i] as Pt;
      const [x2, y2] = polygon[(i + 1) % polygon.length] as Pt;
      if (y1 <= py === y2 <= py) continue; // la arista no cruza la horizontal del punto
      const t = (py - y1) / (y2 - y1);
      if (x1 + t * (x2 - x1) > px) {
        crossings++;
        winding += y2 > y1 ? 1 : -1;
      }
    }
  }
  return { winding, crossings };
}

export const isFilled = (polygons: Pt[][], x: number, y: number, rule: "nonzero" | "evenodd"): boolean => {
  const { winding, crossings } = windingAt(polygons, x, y);
  return rule === "nonzero" ? winding !== 0 : crossings % 2 === 1;
};

/** Imagen RGBA (negro sobre blanco) con zona de silencio, para los decodificadores. */
export function rasterize(d: string, modules: number, quietModules: number, pixelsPerModule: number, rule: "nonzero" | "evenodd") {
  const polygons = parsePolygons(d);
  const total = modules + 2 * quietModules;
  const size = total * pixelsPerModule;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const mx = (px + 0.5) / pixelsPerModule - quietModules;
      const my = (py + 0.5) / pixelsPerModule - quietModules;
      if (isFilled(polygons, mx, my, rule)) {
        const i = (py * size + px) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { width: size, height: size, data };
}
