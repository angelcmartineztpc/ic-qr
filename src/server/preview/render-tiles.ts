import "server-only";

import type { FontRegistry } from "@/lib/document/fonts";
import { outlineScene } from "@/lib/document/outline";
import { buildScene } from "@/lib/document/scene";
import { encodeMatrix } from "@/lib/qr/encode";
import { resolveLayout } from "@/lib/layout/resolve-layout";
import { normalizeText } from "@/lib/text/normalize";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { resolveTemplate } from "@/lib/template/resolve";
import { MenuUrlSchema } from "@/schemas/url";
import type { PreviewRequest, PreviewResponse, PreviewTile } from "@/schemas/preview";
import { ExternalSnapshotSchema } from "@/schemas/qr-geometry";
import { getTemplate } from "@/templates";
import type { QrGeometry, StorageProvider } from "@/types";

export class PreviewError extends Error {
  constructor(
    readonly code: "UNKNOWN_TEMPLATE" | "INVALID_TEMPLATE" | "TEMPLATE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PreviewError";
  }
}

/** Marcador de «QR sin resolver»: una cruz gris en la caja del QR (no es un código legible). */
const PLACEHOLDER: QrGeometry = {
  kind: "external",
  viewBox: [0, 0, 10, 10],
  nodes: [{ type: "path", d: "M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5", fill: "none", fillRule: "nonzero", stroke: "#BBBBBB", strokeWidth: 0.5 }],
  strokeBased: true,
};

/**
 * Qué QR se dibuja en la vista previa (nunca genera ni sube nada):
 *  - generado: el de su payload (si el Link del menú cambió, se ve el QR que se imprimiría: el antiguo)
 *  - sin QR aún: vista previa del QR del Link del menú, si es válido
 *  - existente: su instantánea verificada; sin verificar, el marcador
 */
export async function previewQrGeometry(tile: PreviewTile, storage: Pick<StorageProvider, "get">): Promise<QrGeometry> {
  const { qr } = tile;
  try {
    if (qr.source === "generated") {
      const matrix = encodeMatrix(qr.payload);
      return { kind: "matrix", matrix, modules: matrix.length };
    }
    if (qr.source === "existing") {
      if (!qr.snapshotKey || !qr.assetSha256) return PLACEHOLDER;
      const stored = await storage.get(qr.snapshotKey);
      if (!stored) return PLACEHOLDER;
      const snapshot = ExternalSnapshotSchema.safeParse(JSON.parse(new TextDecoder().decode(stored.body)));
      if (!snapshot.success || snapshot.data.assetSha256 !== qr.assetSha256) return PLACEHOLDER;
      const { geometry } = snapshot.data;
      return { kind: "external", viewBox: geometry.viewBox, nodes: geometry.nodes, strokeBased: geometry.strokeBased };
    }
    const menu = MenuUrlSchema.safeParse(tile.menuUrl);
    if (!menu.success) return PLACEHOLDER;
    const matrix = encodeMatrix(menu.data);
    return { kind: "matrix", matrix, modules: matrix.length };
  } catch {
    return PLACEHOLDER;
  }
}

export interface RenderTilesDeps {
  fonts: FontRegistry;
  storage: Pick<StorageProvider, "get">;
}

/** Dibuja las piezas pedidas: escena → contornos → SVG. Misma geometría que el PDF. */
export async function renderPreviewTiles(request: PreviewRequest, deps: RenderTilesDeps): Promise<PreviewResponse> {
  const base = getTemplate(request.templateId);
  if (!base) throw new PreviewError("UNKNOWN_TEMPLATE", `Plantilla desconocida: ${request.templateId}`);
  if (request.layout.templateId !== request.templateId) throw new PreviewError("TEMPLATE_MISMATCH", "La plantilla y el layout no coinciden");
  const resolved = resolveTemplate(base, request.templateOverrides);
  if (!resolved.success) throw new PreviewError("INVALID_TEMPLATE", `Los ajustes de la plantilla no son válidos: ${resolved.error.issues[0]?.message ?? ""}`);
  const template = resolved.data;
  const fonts = deps.fonts.forTemplate(template);

  const tiles: PreviewResponse["tiles"] = {};
  for (const tile of request.tiles) {
    const record = {
      id: tile.recordId,
      area: normalizeText(tile.area),
      estacion: normalizeText(tile.estacion),
      mesa: normalizeText(tile.mesa),
      subgrupo: normalizeText(tile.subgrupo),
      concepto: normalizeText(tile.concepto),
      menuUrl: tile.menuUrl,
    };
    const scene = buildScene({ template, layout: resolveLayout(request.layout, tile.recordId), record, qr: await previewQrGeometry(tile, deps.storage), fonts });
    const drawn = request.detail === "low" ? scene : outlineScene(scene, fonts);
    tiles[tile.key] = { svg: renderSceneSvg(drawn, { detail: request.detail }), warnings: scene.warnings };
  }
  return { tiles };
}
