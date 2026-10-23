/**
 * buildScene: la ÚNICA descripción geométrica de una pieza (§A.7). De aquí
 * salen la vista previa, el SVG por pieza y el PDF, así que la posición de
 * cada elemento se calcula una sola vez.
 *
 * Coordenadas en mm, origen en la esquina superior izquierda de la pieza,
 * y hacia abajo. El orden de los nodos es el orden de pintado.
 */
import { matrixToPath } from "@/lib/qr/matrix-to-path";
import { styledQrNodes } from "@/lib/qr-style/nodes";
import { isDefaultQrStyle } from "@/lib/qr-style/style-qr";
import { qrStyleWarnings } from "@/lib/qr-style/warnings";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/schemas/qr-style";
import { PT_TO_MM, round } from "@/lib/units";
import { qrModuleMm, qrModuleWarning } from "@/lib/layout/warnings";
import type {
  FontRef,
  Layout,
  LayoutWarning,
  Paint,
  QrGeometry,
  QRRecord,
  SceneNode,
  Template,
  TextElement,
  TileScene,
} from "@/types";

import type { FontResolver } from "./fonts";
import { applyTransform, fitText, missingGlyphs, resolveText } from "./text/engine";

/** Datos de la pieza que usa la escena (solo los campos enlazables y su id). */
export type SceneRecord = Pick<QRRecord, "id" | "area" | "estacion" | "mesa" | "subgrupo" | "concepto" | "menuUrl">;

export interface BuildSceneInput {
  template: Template;
  layout: Layout;
  record: SceneRecord;
  qr: QrGeometry;
  fonts: FontResolver;
  options?: SceneOptions;
  /** Estilo visual del QR. Solo aplica a QR generados (matriz); un QR existente se dibuja tal cual. */
  qrStyle?: QrStyle;
}

export interface SceneOptions {
  /** Fondo blanco propio del QR (spec §11). Por defecto true. */
  includeQrBackground?: boolean;
  /** Línea de corte exacta de la pieza (rgb o tinta plana CutContour). */
  cutLine?: "none" | "rgb" | "spot";
  /** Sangrado en mm: el fondo se extiende por fuera; texto y QR no se mueven. */
  bleedMm?: number;
}

const DIELINE: Paint = { rgb: "#FF00FF", pdf: { spot: "CutContour", cmyk: [0, 100, 0, 0] } };
const PX = 1000; // las coordenadas del path se redondean a micras (3 decimales en mm)

const paint = (rgb: Paint["rgb"], pdf?: TextElement["pdfColor"]): Paint => (pdf ? { rgb, pdf } : { rgb });
const mm = (n: number): number => round(n, 1 / PX);

interface PlacedLine {
  element: TextElement;
  text: string;
  sizePt: number;
  widthMm: number;
  baselineMm: number;
  xMm: number;
}

/** Alto de una línea según la métrica de la plantilla: mayúscula o interlineado. */
function lineAdvanceMm(metric: Template["content"]["vMetric"], sizePt: number, lineHeight: number, capHeightEm: number): number {
  return metric === "cap" ? sizePt * PT_TO_MM * capHeightEm : sizePt * PT_TO_MM * lineHeight;
}

/**
 * Apila las líneas dentro de la caja del bloque. Con métrica "cap" el primer
 * renglón arranca con la parte alta de la mayúscula en y; cada renglón siguiente
 * deja `marginTopMm` entre la base anterior y la parte alta de su mayúscula
 * (así se calculó el presupuesto de §E.11).
 */
function layoutContent(
  template: Template,
  box: Layout["content"],
  record: SceneRecord,
  fonts: FontResolver,
  warnings: LayoutWarning[],
): PlacedLine[] {
  const values: Record<string, string> = {
    area: record.area,
    estacion: record.estacion,
    mesa: record.mesa,
    subgrupo: record.subgrupo,
    concepto: record.concepto,
    menuUrl: record.menuUrl,
  };
  const metric = template.content.vMetric;

  interface Row {
    element: TextElement;
    text: string;
    sizePt: number;
    widthMm: number;
    font: ReturnType<FontResolver>;
    /** Distancia desde la parte alta del renglón hasta su base. */
    ascentMm: number;
    heightMm: number;
    marginMm: number;
  }
  const rows: Row[] = [];

  for (const element of template.content.items) {
    const resolved = resolveText(element.text, values);
    if (element.hideWhenEmpty && (resolved.text === "" || resolved.allEmpty)) continue;
    const text = applyTransform(resolved.text, element.transform);
    if (text === "") continue;

    const font = fonts(element.font);
    for (const char of missingGlyphs(font, text)) warnings.push({ code: "MISSING_GLYPH", elementId: element.id, char });

    const fitted = fitText(font, text, element, box.width);
    if (fitted.overflowX) warnings.push({ code: "TEXT_OVERFLOW", elementId: element.id, axis: "x" });

    const capEm = font.capHeight / font.unitsPerEm;
    fitted.lines.forEach((line, index) => {
      const sizeMm = fitted.sizePt * PT_TO_MM;
      const width = fitted.lines.length === 1 ? fitted.widthMm : fitText(font, line, { ...element, fit: { mode: "none" } }, box.width).widthMm;
      rows.push({
        element,
        text: line,
        sizePt: fitted.sizePt,
        widthMm: width,
        font,
        ascentMm: metric === "cap" ? sizeMm * capEm : sizeMm * (font.ascent / font.unitsPerEm),
        heightMm: lineAdvanceMm(metric, fitted.sizePt, element.lineHeight, capEm),
        marginMm: index === 0 ? element.marginTopMm : Math.max(0, sizeMm * (element.lineHeight - capEm)),
      });
    });
  }

  // Altura total: en "cap", la base de cada renglón + margen hasta la mayúscula del siguiente.
  let cursor = 0;
  const tops: number[] = rows.map((row, index) => {
    const top = index === 0 ? 0 : cursor + row.marginMm;
    cursor = top + (metric === "cap" ? row.ascentMm : row.heightMm);
    return top;
  });
  const total = cursor;
  const offset = template.content.verticalAlign === "center" ? (box.height - total) / 2 : template.content.verticalAlign === "end" ? box.height - total : 0;
  if (total > box.height + 1e-9) {
    const last = rows.at(-1);
    if (last) warnings.push({ code: "TEXT_OVERFLOW", elementId: last.element.id, axis: "y" });
  }

  return rows.map((row, index) => {
    const widthAvail = box.width;
    const x =
      row.element.align === "center" ? box.x + (widthAvail - row.widthMm) / 2 : row.element.align === "end" ? box.x + widthAvail - row.widthMm : box.x;
    return {
      element: row.element,
      text: row.text,
      sizePt: row.sizePt,
      widthMm: row.widthMm,
      xMm: mm(x),
      baselineMm: mm(box.y + offset + (tops[index] ?? 0) + row.ascentMm),
    };
  });
}

export function buildScene(input: BuildSceneInput): TileScene {
  const { template, layout, record, qr, fonts } = input;
  const options = input.options ?? {};
  const bleed = options.bleedMm ?? 0;
  const warnings: LayoutWarning[] = [];
  const nodes: SceneNode[] = [];
  const { width, height } = template.tile;

  // Fondo de la pieza (se extiende con el sangrado; el resto no se mueve).
  if (template.tile.background) {
    nodes.push({
      type: "rect",
      layer: "background",
      id: "tile-background",
      x: -bleed,
      y: -bleed,
      w: width + 2 * bleed,
      h: height + 2 * bleed,
      ...(template.tile.cornerRadiusMm > 0 && bleed === 0 ? { r: template.tile.cornerRadiusMm } : {}),
      fill: paint(template.tile.background),
    });
  }

  for (const shape of template.shapes) {
    if (shape.type === "rect") {
      if (shape.role === "dieline" && options.cutLine !== undefined && options.cutLine !== "none") continue;
      nodes.push({
        type: "rect",
        layer: "artwork",
        id: shape.id,
        x: shape.box.x,
        y: shape.box.y,
        w: shape.box.width,
        h: shape.box.height,
        ...(shape.radiusMm > 0 ? { r: shape.radiusMm } : {}),
        ...(shape.fill ? { fill: paint(shape.fill) } : {}),
        ...(shape.stroke ? { stroke: { paint: paint(shape.stroke), widthMm: shape.strokeWidthPt * PT_TO_MM } } : {}),
      });
    } else {
      // Las líneas son rectángulos finos: así el SVG y el PDF no necesitan trazos.
      const horizontal = shape.y1 === shape.y2;
      const thick = shape.strokeWidthPt * PT_TO_MM;
      nodes.push({
        type: "rect",
        layer: "artwork",
        id: shape.id,
        x: Math.min(shape.x1, shape.x2) - (horizontal ? 0 : thick / 2),
        y: Math.min(shape.y1, shape.y2) - (horizontal ? thick / 2 : 0),
        w: horizontal ? Math.abs(shape.x2 - shape.x1) : thick,
        h: horizontal ? thick : Math.abs(shape.y2 - shape.y1),
        fill: paint(shape.stroke),
      });
    }
  }

  // QR: fondo propio (caja completa, incluye la zona de silencio) + un solo path.
  const qrBox = layout.qr;
  const dark = template.qr.invert ? template.qr.background : template.qr.foreground;
  const light = template.qr.invert ? template.qr.foreground : template.qr.background;
  const style = input.qrStyle ?? DEFAULT_QR_STYLE;
  if (qr.kind === "matrix" && !isDefaultQrStyle(style)) {
    const styled = styledQrNodes({
      box: qrBox,
      matrix: qr.matrix,
      quietZoneModules: template.qr.quietZoneModules,
      style,
      base: { dark, light },
      includeBackground: options.includeQrBackground !== false,
    });
    const warning = qrModuleWarning(styled.moduleMm, template.qr);
    if (warning) warnings.push(warning);
    if (options.includeQrBackground === false || (template.qr.invert && style.colors.background === null)) warnings.push({ code: "QR_NO_WHITE_BACKGROUND" });
    warnings.push(...qrStyleWarnings(style, styled.colors, qr.modules));
    nodes.push(...styled.nodes);
  } else if (qr.kind === "matrix") {
    const modules = qr.modules;
    const moduleMm = qrModuleMm(qrBox.width, modules, template.qr.quietZoneModules);
    const warning = qrModuleWarning(moduleMm, template.qr);
    if (warning) warnings.push(warning);
    if (options.includeQrBackground === false || template.qr.invert) warnings.push({ code: "QR_NO_WHITE_BACKGROUND" });
    if (options.includeQrBackground !== false) {
      nodes.push({ type: "rect", layer: "qr", id: "qr-background", x: qrBox.x, y: qrBox.y, w: qrBox.width, h: qrBox.height, fill: paint(light) });
    }
    const origin = template.qr.quietZoneModules * moduleMm;
    nodes.push({
      type: "path",
      layer: "qr",
      id: "qr-code",
      d: matrixToPath(qr.matrix, { x: qrBox.x + origin, y: qrBox.y + origin, module: moduleMm, decimals: 3 }),
      fill: paint(dark),
      fillRule: "evenodd",
      title: "QR",
    });
  } else {
    if (options.includeQrBackground !== false) {
      nodes.push({ type: "rect", layer: "qr", id: "qr-background", x: qrBox.x, y: qrBox.y, w: qrBox.width, h: qrBox.height, fill: paint(light) });
    }
    nodes.push({ type: "qrExternal", layer: "qr", id: "qr-code", box: qrBox, geometry: qr });
  }

  // Texto (en vivo; outlineScene lo convierte a contornos).
  for (const line of layoutContent(template, layout.content, record, fonts, warnings)) {
    const font: FontRef = line.element.font;
    nodes.push({
      type: "text",
      layer: "text",
      id: `text-${line.element.id}`,
      text: line.text,
      font,
      sizePt: line.sizePt,
      trackingPt: (line.element.trackingEm1000 / 1000) * line.sizePt,
      xMm: line.xMm,
      baselineMm: line.baselineMm,
      widthMm: mm(line.widthMm),
      fill: paint(line.element.color, line.element.pdfColor),
    });
  }

  // Línea de corte (dieline): contorno exacto de la pieza, 0.1 mm.
  if (options.cutLine && options.cutLine !== "none") {
    nodes.push({
      type: "rect",
      layer: "cutline",
      id: "cutline-outline",
      x: 0,
      y: 0,
      w: width,
      h: height,
      ...(template.tile.cornerRadiusMm > 0 ? { r: template.tile.cornerRadiusMm } : {}),
      stroke: { paint: options.cutLine === "spot" ? DIELINE : { rgb: DIELINE.rgb }, widthMm: 0.1 },
    });
  }

  return {
    widthMm: width,
    heightMm: height,
    nodes,
    warnings,
    meta: { recordId: record.id, templateId: template.id, templateVersion: template.version },
  };
}
