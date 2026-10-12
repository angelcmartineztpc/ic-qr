/**
 * Renderizador SVG de una escena (preview, SVG por pieza y ZIP).
 * - Unidades: width/height en mm y viewBox en décimas de mm (500 × 500 para 50 mm).
 * - Solo geometría: sin <image>, <style>, <use>, scripts ni fuentes web.
 * - Un <g id> por capa (background, artwork, qr, text, cutline): Illustrator las
 *   importa como capas.
 * Estándar SVG 1.1, compatible con Illustrator, Figma e Inkscape.
 */
import { mmToSvg, round, SVG_UNITS_PER_MM } from "@/lib/units";
import type { Matrix2D, Paint, SceneLayer, SceneNode, TileScene } from "@/types";

import { xmlText } from "./escape";

export interface RenderSvgOptions {
  /** 'low': miniaturas (rectángulos en lugar de módulos y glifos). */
  detail?: "full" | "low";
  /** Margen extra alrededor de la pieza en mm (el editor dibuja ahí las reglas). */
  marginMm?: number;
  /** Atributos extra del <svg> (p. ej. class); solo para la UI, nunca en exportación. */
  rootAttrs?: string;
  /** Título del documento (accesibilidad). */
  title?: string;
}

const u = (mm: number): string => String(round(mmToSvg(mm), 0.01) || 0);

/** Escala un path absoluto M/L/Q/C/Z de mm a unidades del viewBox. */
export function scalePath(d: string, factor = SVG_UNITS_PER_MM): string {
  if (/[HhVvAaSsTtmlcqz]/.test(d)) throw new Error("scalePath solo admite comandos absolutos M, L, Q, C y Z");
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => String(round(Number(m) * factor, 0.01) || 0));
}

const fill = (paint: Paint | undefined): string => (paint ? ` fill="${paint.rgb}"` : ' fill="none"');

function rect(node: Extract<SceneNode, { type: "rect" }>): string {
  const r = node.r ? ` rx="${u(node.r)}" ry="${u(node.r)}"` : "";
  const stroke = node.stroke ? ` stroke="${node.stroke.paint.rgb}" stroke-width="${u(node.stroke.widthMm)}"` : "";
  return `<rect id="${xmlText(node.id)}" x="${u(node.x)}" y="${u(node.y)}" width="${u(node.w)}" height="${u(node.h)}"${r}${fill(node.fill)}${stroke}/>`;
}

function matrix(m: Matrix2D | undefined): string {
  return m ? ` transform="matrix(${m.join(" ")})"` : "";
}

function qrExternal(node: Extract<SceneNode, { type: "qrExternal" }>): string {
  const { box, geometry } = node;
  const [vx, vy, vw, vh] = geometry.viewBox;
  const scale = box.width / Math.max(vw, vh); // mm por unidad del SVG original
  const inner = geometry.nodes
    .map((child) =>
      child.type === "path"
        ? `<path d="${xmlText(child.d)}" fill="${child.fill}" fill-rule="${child.fillRule}"${child.stroke ? ` stroke="${child.stroke}" stroke-width="${child.strokeWidth ?? 1}"` : ""}${matrix(child.transform)}/>`
        : `<rect x="${child.x}" y="${child.y}" width="${child.w}" height="${child.h}" fill="${child.fill}"${matrix(child.transform)}/>`,
    )
    .join("");
  const transform = `translate(${u(box.x)} ${u(box.y)}) scale(${round(scale * SVG_UNITS_PER_MM, 1e-6)}) translate(${-vx} ${-vy})`;
  return `<g id="${xmlText(node.id)}" transform="${transform}">${inner}</g>`;
}

function text(node: Extract<SceneNode, { type: "text" }>): string {
  // Texto vivo: la fuente debe estar instalada en el equipo que abre el archivo.
  const spacing = node.trackingPt ? ` letter-spacing="${round(mmToSvg(node.trackingPt * 0.352778), 0.001)}"` : "";
  return (
    `<text id="${xmlText(node.id)}" x="${u(node.xMm)}" y="${u(node.baselineMm)}" font-family="${xmlText(node.font.family)}" ` +
    `font-weight="${node.font.weight}" font-style="${node.font.style}" font-size="${u(node.sizePt * 0.352778)}"${spacing}${fill(node.fill)}>${xmlText(node.text)}</text>`
  );
}

function node(n: SceneNode, detail: "full" | "low"): string {
  switch (n.type) {
    case "rect":
      return rect(n);
    case "path": {
      if (detail === "low" && n.layer === "qr") return "";
      const attrs = `id="${xmlText(n.id)}" d="${scalePath(n.d)}"${fill(n.fill)} fill-rule="${n.fillRule}"`;
      return n.title ? `<path ${attrs}><title>${xmlText(n.title)}</title></path>` : `<path ${attrs}/>`;
    }
    case "text":
      if (detail === "low") {
        const h = n.sizePt * 0.352778 * 0.7;
        return `<rect x="${u(n.xMm)}" y="${u(n.baselineMm - h)}" width="${u(n.widthMm)}" height="${u(h)}"${fill(n.fill)}/>`;
      }
      return text(n);
    case "qrExternal":
      return detail === "low" ? "" : qrExternal(n);
  }
}

const LAYER_ORDER: SceneLayer[] = ["background", "artwork", "qr", "text", "cutline"];

export function renderSceneSvg(scene: TileScene, options: RenderSvgOptions = {}): string {
  const detail = options.detail ?? "full";
  const margin = options.marginMm ?? 0;
  const w = scene.widthMm + 2 * margin;
  const h = scene.heightMm + 2 * margin;
  const body = LAYER_ORDER.map((layer) => {
    const nodes = scene.nodes.filter((nd) => nd.layer === layer);
    if (nodes.length === 0) return "";
    return `<g id="${layer}">${nodes.map((nd) => node(nd, detail)).join("")}</g>`;
  }).join("");

  const title = options.title ? `<title>${xmlText(options.title)}</title>` : "";
  const sized = margin > 0 ? "" : ` width="${scene.widthMm}mm" height="${scene.heightMm}mm"`;
  const viewBox = `${u(-margin)} ${u(-margin)} ${u(w)} ${u(h)}`;
  const attrs = options.rootAttrs ? ` ${options.rootAttrs}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"${sized} viewBox="${viewBox}"${attrs}>${title}${body}</svg>`;
}
