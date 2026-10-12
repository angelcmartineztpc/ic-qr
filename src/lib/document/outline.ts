/**
 * Convierte los nodos de texto en contornos (paths). Por defecto la
 * fabricación usa contornos: no depende de que la fuente esté instalada en
 * Illustrator ni en el taller, y la vista previa es idéntica al PDF.
 */
import { PT_TO_MM, round } from "@/lib/units";
import type { SceneNode, TileScene } from "@/types";

import type { FontResolver, PathCommand } from "./fonts";

const n = (value: number): string => String(round(value, 0.001) || 0);

/** Path `d` con M/L/Q/C/Z absolutos, transformado de unidades de fuente (y arriba) a mm (y abajo). */
export function commandsToPath(commands: readonly PathCommand[], scale: number, tx: number, ty: number): string {
  const px = (x: number) => n(tx + x * scale);
  const py = (y: number) => n(ty - y * scale);
  return commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${px(c.x)} ${py(c.y)}`;
        case "Q":
          return `Q${px(c.x1)} ${py(c.y1)} ${px(c.x)} ${py(c.y)}`;
        case "C":
          return `C${px(c.x1)} ${py(c.y1)} ${px(c.x2)} ${py(c.y2)} ${px(c.x)} ${py(c.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

export function outlineText(node: Extract<SceneNode, { type: "text" }>, fonts: FontResolver): SceneNode {
  const font = fonts(node.font);
  const scale = (node.sizePt * PT_TO_MM) / font.unitsPerEm;
  const trackingMm = node.trackingPt * PT_TO_MM;
  let pen = node.xMm;
  const parts: string[] = [];
  for (const glyph of font.shape(node.text)) {
    const commands = glyph.outline();
    if (commands.length > 0) parts.push(commandsToPath(commands, scale, pen + glyph.xOffset * scale, node.baselineMm - glyph.yOffset * scale));
    pen += glyph.advance * scale + trackingMm;
  }
  return {
    type: "path",
    layer: "text",
    id: node.id,
    d: parts.join(""),
    // Los huecos de las letras (O, A, e…) salen con el sentido contrario: nonzero los respeta.
    fill: node.fill,
    fillRule: "nonzero",
    title: node.text,
  };
}

export function outlineScene(scene: TileScene, fonts: FontResolver): TileScene {
  return { ...scene, nodes: scene.nodes.map((node) => (node.type === "text" ? outlineText(node, fonts) : node)) };
}
