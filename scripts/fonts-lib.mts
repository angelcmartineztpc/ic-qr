/**
 * Utilidades de `fonts:setup`: verificar que un archivo es la fuente correcta (por su
 * huella de anchos, no solo por el nombre) e indexar las fuentes que hay en la máquina.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import * as fontkit from "fontkit";

export interface FontEntry {
  weight: number;
  sha256: string;
  /** Nombre PostScript con el que se busca en la máquina (la caché de Adobe usa nombres opacos). */
  postscriptName?: string;
  /** Huella: avance de algunos glifos por cada 1000 em, tomada de la fuente original. */
  advances?: Record<string, number>;
}

/** Lo mínimo que se usa de una fuente (así se puede probar sin archivos con licencia). */
export interface MeasurableFont {
  unitsPerEm: number;
  layout(text: string): { advanceWidth: number };
}

/** Tolerancia en unidades por 1000 em: absorbe redondeos entre formatos (otf → woff2). */
const ADVANCE_TOLERANCE = 1;

/** Devuelve los glifos cuyo ancho no coincide con la huella (vacío = es la fuente correcta). */
export function advanceMismatches(font: MeasurableFont, advances: Record<string, number>): string[] {
  return Object.entries(advances)
    .filter(([char, expected]) => {
      const actual = Math.round((font.layout(char).advanceWidth / font.unitsPerEm) * 1000);
      return Math.abs(actual - expected) > ADVANCE_TOLERANCE;
    })
    .map(([char]) => char);
}

export interface FontCandidate {
  path: string;
  postscriptName: string;
  /** woff2 ya está listo; otf/ttf (o sin extensión, como la caché de Adobe) hay que convertirlos. */
  isWoff2: boolean;
}

const MIN_BYTES = 8_000;
const MAX_BYTES = 3_000_000;

/** Recorre carpetas (incluidas las ocultas, como `.e/` de la caché de Adobe) y lista las fuentes legibles. */
export function scanFonts(roots: string[], maxDepth = 4): FontCandidate[] {
  const found: FontCandidate[] = [];
  const walk = (dir: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      let info;
      try {
        info = statSync(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (depth < maxDepth) walk(path, depth + 1);
        continue;
      }
      if (info.size < MIN_BYTES || info.size > MAX_BYTES) continue;
      try {
        const opened = fontkit.openSync(path);
        if ("fonts" in opened) continue; // colecciones (.ttc): no aplican
        found.push({ path, postscriptName: opened.postscriptName, isWoff2: /\.woff2$/i.test(name) });
      } catch {
        // no es una fuente
      }
    }
  };
  for (const root of roots) walk(root, 0);
  return found;
}
