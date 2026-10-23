import { PreviewRequestSchema } from "@/services/qr-produccion/schemas/preview";

import { HttpError } from "../http/errors";
import { parseBody } from "../http/validate";
import { PreviewError, renderPreviewTiles, type RenderTilesDeps } from "./render-tiles";

/** POST qr-vista-previa: piezas ya dibujadas (contornos). Las fuentes comerciales solo viven en el servidor. */
export async function runPreview(raw: unknown, deps: RenderTilesDeps) {
  const request = parseBody(PreviewRequestSchema, raw, "Petición de vista previa no válida");
  try {
    return await renderPreviewTiles(request, deps);
  } catch (error) {
    if (error instanceof PreviewError) throw new HttpError(400, "VALIDATION_FAILED", error.message);
    if (error instanceof Error && /Falta el archivo de fuente|Fuente no disponible/.test(error.message)) {
      throw new HttpError(503, "FONTS_MISSING", "Faltan las fuentes de las piezas en el servidor (súbelas al bucket «qr-fuentes»)");
    }
    throw error;
  }
}
