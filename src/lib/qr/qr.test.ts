import { createHash } from "node:crypto";

import jsQR from "jsqr";
import { decodeQR } from "qr/decode.js";
import { describe, expect, it } from "vitest";

import { isFilled, parsePolygons, rasterize } from "../../../tests/helpers/raster-path";
import { encodeMatrix, MAX_PAYLOAD_LENGTH, qrVersion } from "./encode";
import { matrixToContours, matrixToPath } from "./matrix-to-path";
import { renderQrSvg } from "./render-svg";
import { QR_RENDERER_VERSION } from "./version";

const URL_SHORT = "https://menu.example.com/tropical";
const URL_LONG = "https://menu.restaurante-ejemplo.com/tropical/terraza/mesa-12?utm_source=qr&utm_medium=placa";

/** Matriz pseudoaleatoria determinista (para fuzz del contorno, incluidas diagonales y huecos). */
function randomMatrix(size: number, seed: number, density: number) {
  let s = seed;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: size }, () => Array.from({ length: size }, () => next() < density));
}

describe("encodeMatrix", () => {
  it("URL corta → versión 4 (33 × 33) sin zona de silencio", () => {
    const matrix = encodeMatrix(URL_SHORT);
    expect([matrix.length, matrix[0]?.length]).toEqual([33, 33]);
    expect(qrVersion(33)).toBe(4);
    // Los tres cuadros de localización están en las esquinas (7 × 7 con borde oscuro).
    expect(matrix[0]?.slice(0, 7).every(Boolean)).toBe(true);
    expect(matrix[0]?.slice(-7).every(Boolean)).toBe(true);
    expect(matrix[32]?.slice(0, 7).every(Boolean)).toBe(true);
  });

  it("corrección H: 34 caracteres caben en v4 (33 módulos) y 35 pasan a v5 (37)", () => {
    const at34 = "https://menu.example.com/123456789";
    expect(at34).toHaveLength(34);
    expect(encodeMatrix(at34).length).toBe(33);
    expect(encodeMatrix(`${at34}0`).length).toBe(37);
    expect(qrVersion(encodeMatrix(URL_LONG).length)).toBeGreaterThanOrEqual(5);
  });

  it("rechaza vacío y demasiado largo", () => {
    expect(() => encodeMatrix("")).toThrow(RangeError);
    expect(() => encodeMatrix("x".repeat(MAX_PAYLOAD_LENGTH + 1))).toThrow(RangeError);
  });

  it("es determinista", () => {
    expect(encodeMatrix(URL_SHORT)).toEqual(encodeMatrix(URL_SHORT));
  });
});

describe("matrixToPath — un solo path compuesto", () => {
  it("el contorno coincide módulo a módulo con la matriz, con nonzero Y even-odd (fuzz 300)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const size = 5 + (seed % 9);
      const matrix = randomMatrix(size, seed, 0.25 + (seed % 5) * 0.12);
      const polygons = parsePolygons(matrixToPath(matrix, { x: 0, y: 0, module: 1, decimals: 0 }));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const expected = matrix[y]?.[x] ?? false;
          expect(isFilled(polygons, x + 0.5, y + 0.5, "nonzero"), `seed ${seed} (${x},${y}) nonzero`).toBe(expected);
          expect(isFilled(polygons, x + 0.5, y + 0.5, "evenodd"), `seed ${seed} (${x},${y}) evenodd`).toBe(expected);
        }
      }
    }
  });

  it("QR real: coincide con la matriz y usa muchos menos nodos que un rect por módulo", () => {
    const matrix = encodeMatrix(URL_LONG);
    const polygons = parsePolygons(matrixToPath(matrix, { x: 0, y: 0, module: 1, decimals: 0 }));
    matrix.forEach((row, y) => row.forEach((dark, x) => expect(isFilled(polygons, x + 0.5, y + 0.5, "evenodd")).toBe(dark)));
    const darkModules = matrix.flat().filter(Boolean).length;
    const vertices = polygons.reduce((n, p) => n + p.length, 0);
    expect(vertices).toBeLessThan(darkModules * 4);
  });

  it("solo emite M, L y Z absolutos (compatible con la escala del SVG y con pdfkit)", () => {
    const d = matrixToPath(encodeMatrix(URL_SHORT), { x: 13, y: 24, module: 0.6486, decimals: 3 });
    expect(d).toMatch(/^[MLZ0-9. -]+$/);
    expect(d.match(/M/g)?.length).toBe(d.match(/Z/g)?.length);
  });

  it("los bucles exteriores son horarios y los huecos antihorarios", () => {
    const ring = [
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ];
    const area = (loop: ReadonlyArray<readonly [number, number]>) =>
      loop.reduce((sum, p, i) => sum + (p[0] * (loop[(i + 1) % loop.length]?.[1] ?? 0) - (loop[(i + 1) % loop.length]?.[0] ?? 0) * p[1]), 0) / 2;
    const [outer, hole] = matrixToContours(ring);
    expect(area(outer ?? [])).toBeGreaterThan(0);
    expect(area(hole ?? [])).toBeLessThan(0);
  });
});

describe("decodificación real (el QR es legible)", () => {
  it.each([URL_SHORT, URL_LONG, "https://menu.example.com/menú/ñandú?mesa=M–1"])("%s", (payload) => {
    const matrix = encodeMatrix(payload);
    const d = matrixToPath(matrix, { x: 0, y: 0, module: 1, decimals: 0 });
    for (const rule of ["nonzero", "evenodd"] as const) {
      const image = rasterize(d, matrix.length, 4, 6, rule);
      expect(decodeQR(image)).toBe(payload);
      expect(jsQR(image.data, image.width, image.height)?.data).toBe(payload);
    }
  });
});

describe("SVG canónico del asset", () => {
  it("estructura: fondo blanco, un solo path, zona de silencio de 4 módulos, sin raster", () => {
    const svg = renderQrSvg(encodeMatrix(URL_SHORT));
    expect(svg).toContain('viewBox="0 0 41 41"'); // 33 + 2·4
    expect(svg).toContain('<rect width="41" height="41" fill="#FFFFFF"/>');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).not.toMatch(/<image|<style|<script|<use|<text/);
  });

  it("es determinista byte a byte y su hash dorado detecta cambios de la librería o del renderer", () => {
    const svg = renderQrSvg(encodeMatrix(URL_SHORT));
    expect(renderQrSvg(encodeMatrix(URL_SHORT))).toBe(svg);
    expect(QR_RENDERER_VERSION).toBe("qrsvg-1+qr@0.7.2");
    expect(createHash("sha256").update(svg).digest("hex")).toBe("a82f64cf8a72f2af113422b7f81d1b3582487ace7c0a53c08dd5ed3962cc48d8");
  });
});
