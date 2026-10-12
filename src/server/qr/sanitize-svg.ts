import "server-only";

import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";

import { ExternalGeometrySchema, MAX_GEOMETRY_NODES, MAX_PATH_LENGTH, PATH_DATA, type ExternalGeometry } from "@/schemas/qr-geometry";
import type { ExternalNode, HexColor, Matrix2D } from "@/types";

export class SvgRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgRejectedError";
  }
}

export const SVG_LIMITS = { maxBytes: 512 * 1024, maxNumbers: 200_000, maxDimension: 20_000 } as const;

const reject = (message: string): never => {
  throw new SvgRejectedError(message);
};

// ---------- color ----------
const NAMED: Record<string, HexColor> = { black: "#000000", white: "#FFFFFF" };
function parseColor(raw: string): HexColor | "none" {
  const value = raw.trim().toLowerCase();
  if (value === "none" || value === "transparent") return "none";
  if (value === "currentcolor") return "#000000";
  if (NAMED[value]) return NAMED[value];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase() as HexColor;
  if (/^#[0-9a-f]{6}$/.test(value)) return value.toUpperCase() as HexColor;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)));
    return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`.toUpperCase() as HexColor;
  }
  return reject(`Color no admitido: ${raw.slice(0, 40)}`);
}

// ---------- transform ----------
const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix2D, b: Matrix2D): Matrix2D => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

function parseTransform(raw: string): Matrix2D {
  let result = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let consumed = 0;
  for (const match of raw.matchAll(re)) {
    consumed += match[0].length;
    const args = (match[2] ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    if (args.some((n) => !Number.isFinite(n))) reject("Transformación no válida");
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = args;
    let m: Matrix2D;
    switch (match[1]) {
      case "matrix":
        if (args.length !== 6) reject("matrix() necesita 6 valores");
        m = [a, b, c, d, e, f];
        break;
      case "translate":
        m = [1, 0, 0, 1, a, args.length > 1 ? b : 0];
        break;
      case "scale":
        m = [a, 0, 0, args.length > 1 ? b : a, 0, 0];
        break;
      case "rotate": {
        const rad = (a * Math.PI) / 180;
        const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
        const rotation: Matrix2D = [cos, sin, -sin, cos, 0, 0];
        m = args.length === 3 ? multiply(multiply([1, 0, 0, 1, b, c], rotation), [1, 0, 0, 1, -b, -c]) : rotation;
        break;
      }
      case "skewX":
        m = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        m = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
    }
    result = multiply(result, m);
  }
  if (raw.replace(re, "").replace(/[\s,]/g, "") !== "" && consumed === 0) reject("Transformación no admitida");
  return result;
}

const isIdentity = (m: Matrix2D) => m.every((v, i) => Math.abs(v - IDENTITY[i]!) < 1e-9);
const rounded = (m: Matrix2D): Matrix2D => m.map((v) => Math.round(v * 1e6) / 1e6) as Matrix2D;

// ---------- recorrido ----------
interface Style {
  fill: HexColor | "none";
  fillRule: "nonzero" | "evenodd";
  stroke: HexColor | "none";
  strokeWidth: number;
  transform: Matrix2D;
}

const FORBIDDEN_VALUE = /javascript:|data:|url\s*\(|@import|expression\s*\(/i;

function readStyle(element: XmlElement, parent: Style): Style {
  const style = { ...parent };
  const declarations: Record<string, string> = {};
  const styleAttr = element.getAttribute("style");
  if (styleAttr) {
    if (FORBIDDEN_VALUE.test(styleAttr)) reject("El atributo style contiene referencias externas");
    for (const part of styleAttr.split(";")) {
      const [k, ...rest] = part.split(":");
      if (k && rest.length) declarations[k.trim().toLowerCase()] = rest.join(":").trim();
    }
  }
  const get = (name: string) => declarations[name] ?? element.getAttribute(name);
  const fill = get("fill");
  if (fill) style.fill = parseColor(fill);
  const rule = get("fill-rule");
  if (rule === "evenodd" || rule === "nonzero") style.fillRule = rule;
  const stroke = get("stroke");
  if (stroke) style.stroke = parseColor(stroke);
  const width = get("stroke-width");
  if (width && Number.isFinite(Number(width))) style.strokeWidth = Math.max(0, Number(width));
  const transform = element.getAttribute("transform");
  if (transform) style.transform = multiply(parent.transform, parseTransform(transform));
  return style;
}

const SKIPPED = new Set(["title", "desc", "metadata", "defs"]);
const ALLOWED = new Set(["svg", "g", "path", "rect", "polygon"]);

function checkAttributes(element: XmlElement): void {
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes.item(i);
    if (!attr) continue;
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "href" || name.endsWith(":href")) reject(`Atributo no admitido: ${attr.name}`);
    if (FORBIDDEN_VALUE.test(attr.value)) reject(`El atributo ${attr.name} contiene una referencia no admitida`);
  }
}

function numberAttr(element: XmlElement, name: string, fallback = 0): number {
  const raw = element.getAttribute(name);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || /[^0-9eE+\-.\s%a-z]/.test(raw)) reject(`${name} no es un número`);
  return value;
}

/**
 * Convierte un SVG externo en geometría saneada (§S2.4, §S8): lista blanca de
 * elementos, sin DOCTYPE/entidades, sin referencias externas ni scripts, con
 * límites numéricos. Se descarta todo lo que no sea geometría y la salida se
 * reemite desde cero: el SVG original nunca llega a ningún renderer.
 */
export function sanitizeExternalSvg(bytes: Uint8Array): ExternalGeometry {
  if (bytes.length > SVG_LIMITS.maxBytes) reject("El SVG supera el tamaño máximo");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return reject("El SVG no está en UTF-8");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) reject("No se admiten DOCTYPE ni entidades");
  if (/<\?(?!xml[\s?])/i.test(source)) reject("No se admiten instrucciones de procesamiento");

  const problems: string[] = [];
  let root: XmlElement | null;
  try {
    const doc = new DOMParser({ onError: (level, message) => (level === "warning" ? undefined : problems.push(message)) }).parseFromString(source, "image/svg+xml");
    root = doc.documentElement;
  } catch {
    return reject("El SVG no es XML bien formado");
  }
  if (problems.length > 0 || !root) return reject("El SVG no es XML bien formado");
  if (root.localName !== "svg") reject("El archivo no es un SVG");

  // viewBox
  const viewBoxAttr = root.getAttribute("viewBox");
  let viewBox: [number, number, number, number];
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return reject("viewBox no válido");
    viewBox = parts as [number, number, number, number];
  } else {
    viewBox = [0, 0, numberAttr(root, "width"), numberAttr(root, "height")];
  }
  if (!(viewBox[2] > 0 && viewBox[3] > 0)) reject("El SVG no declara un tamaño");
  if (viewBox[2] > SVG_LIMITS.maxDimension || viewBox[3] > SVG_LIMITS.maxDimension) reject("Las dimensiones del SVG son desproporcionadas");
  for (const dim of ["width", "height"] as const) if (numberAttr(root, dim) > SVG_LIMITS.maxDimension) reject("Las dimensiones del SVG son desproporcionadas");

  const nodes: ExternalNode[] = [];
  let numbers = 0;
  let strokeBased = false;
  const base: Style = { fill: "#000000", fillRule: "nonzero", stroke: "none", strokeWidth: 1, transform: IDENTITY };

  const walk = (element: XmlElement, parent: Style): void => {
    const name = (element.localName ?? element.tagName).toLowerCase();
    if (SKIPPED.has(name)) {
      if (name === "defs" && Array.from(element.childNodes).some((c) => c.nodeType === 1)) reject("<defs> con contenido no admitido");
      return;
    }
    if (!ALLOWED.has(name)) reject(`Elemento no admitido: <${name}>`);
    checkAttributes(element);
    const style = name === "svg" ? readStyle(element, { ...parent, transform: IDENTITY }) : readStyle(element, parent);

    if (nodes.length >= MAX_GEOMETRY_NODES) reject("El SVG tiene demasiados elementos");
    const transform = isIdentity(style.transform) ? undefined : rounded(style.transform);
    const withTransform = transform ? { transform } : {};
    const visible = style.fill !== "none" || style.stroke !== "none";

    if (name === "path" || name === "polygon") {
      let d: string;
      if (name === "path") {
        d = element.getAttribute("d") ?? "";
      } else {
        const pts = (element.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
        if (pts.length < 6 || pts.length % 2 !== 0 || pts.some((n) => !Number.isFinite(n))) return reject("polygon no válido");
        d = `M${pts[0]} ${pts[1]}${Array.from({ length: pts.length / 2 - 1 }, (_, i) => `L${pts[2 * i + 2]} ${pts[2 * i + 3]}`).join("")}Z`;
      }
      if (d.length > MAX_PATH_LENGTH) reject("Un path es demasiado largo");
      if (!PATH_DATA.test(d)) reject("El path contiene comandos no admitidos");
      numbers += d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.length ?? 0;
      if (numbers > SVG_LIMITS.maxNumbers) reject("El SVG tiene demasiados números");
      if (visible && d.trim() !== "") {
        // Con trazo visible el QR se dibuja con líneas (los módulos son el grosor): aviso para CAM.
        if (style.stroke !== "none") strokeBased = true;
        nodes.push({
          type: "path",
          d,
          fill: style.fill,
          fillRule: style.fillRule,
          ...(style.stroke === "none" ? {} : { stroke: style.stroke, strokeWidth: style.strokeWidth }),
          ...withTransform,
        });
      }
    } else if (name === "rect") {
      const w = numberAttr(element, "width");
      const h = numberAttr(element, "height");
      if (style.fill !== "none" && w > 0 && h > 0) {
        nodes.push({ type: "rect", x: numberAttr(element, "x"), y: numberAttr(element, "y"), w, h, fill: style.fill, ...withTransform });
      } else if (style.stroke !== "none" && w > 0 && h > 0) {
        strokeBased = true;
        const [x, y] = [numberAttr(element, "x"), numberAttr(element, "y")];
        nodes.push({ type: "path", d: `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`, fill: "none", fillRule: "nonzero", stroke: style.stroke, strokeWidth: style.strokeWidth, ...withTransform });
      }
    }

    for (const child of Array.from(element.childNodes)) if (child.nodeType === 1) walk(child as unknown as XmlElement, style);
  };

  walk(root, base);
  if (nodes.length === 0) reject("El SVG no contiene geometría visible");
  // Validación final con el mismo schema que se usa al leer instantáneas.
  const parsed = ExternalGeometrySchema.safeParse({ viewBox, nodes, strokeBased });
  if (!parsed.success) return reject(`Geometría no válida: ${parsed.error.issues[0]?.message ?? "desconocido"}`);
  return parsed.data;
}
