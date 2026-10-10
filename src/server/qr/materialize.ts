import "server-only";

import { encodeMatrix } from "@/lib/qr/encode";
import { renderQrSvg } from "@/lib/qr/render-svg";
import { ExternalSnapshotSchema } from "@/schemas/qr-geometry";
import type { ExportRecord, QrGeometry, StorageProvider } from "@/types";

import { sha256Hex } from "./hash";
import { sanitizeExternalSvg } from "./sanitize-svg";

export class MaterializeError extends Error {
  readonly code = "QR_UNRESOLVED" as const;
  constructor(
    readonly recordId: string,
    message: string,
  ) {
    super(message);
    this.name = "MaterializeError";
  }
}

export interface MaterializeDeps {
  storage: Pick<StorageProvider, "get">;
  warn?: (message: string, fields: Record<string, string>) => void;
}

/**
 * Geometría que se dibuja en la exportación. NUNCA escribe en el storage, NUNCA
 * crea un QR y NUNCA sale a la red:
 *  - generado: se re-codifica el payload con el renderer fijado y debe dar,
 *    byte a byte, el SVG guardado (svgSha256). Si cambió el renderer, se lee y
 *    sanea el archivo almacenado. Eso no es regenerar: se imprime el archivo guardado.
 *  - existente: se lee la instantánea saneada que se guardó al verificarlo.
 */
export async function materializeQrGeometry(record: ExportRecord, deps: MaterializeDeps): Promise<QrGeometry> {
  const qr = record.qr;
  if (qr.source === "generated") {
    const matrix = encodeMatrix(qr.payload);
    if (sha256Hex(renderQrSvg(matrix)) === qr.svgSha256) return { kind: "matrix", matrix, modules: matrix.length };

    deps.warn?.("El renderer del QR cambió: se usa el archivo almacenado", { recordId: record.id, storageKey: qr.storageKey });
    const stored = await deps.storage.get(qr.storageKey);
    if (!stored) throw new MaterializeError(record.id, "El archivo del QR ya no existe en el almacenamiento");
    const geometry = sanitizeExternalSvg(stored.body);
    return { kind: "external", viewBox: geometry.viewBox, nodes: geometry.nodes, strokeBased: geometry.strokeBased };
  }

  if (qr.source === "existing" && qr.snapshotKey) {
    const stored = await deps.storage.get(qr.snapshotKey);
    if (!stored) throw new MaterializeError(record.id, "La instantánea del QR existente no está en el almacenamiento: vuelve a verificarlo");
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(stored.body));
    } catch {
      throw new MaterializeError(record.id, "La instantánea del QR existente está dañada");
    }
    const snapshot = ExternalSnapshotSchema.safeParse(json);
    if (!snapshot.success) throw new MaterializeError(record.id, "La instantánea del QR existente no es válida");
    if (snapshot.data.assetSha256 !== qr.assetSha256) throw new MaterializeError(record.id, "La instantánea no corresponde al QR verificado");
    const { geometry } = snapshot.data;
    return { kind: "external", viewBox: geometry.viewBox, nodes: geometry.nodes, strokeBased: geometry.strokeBased };
  }
  throw new MaterializeError(record.id, "El QR del registro no está resuelto");
}
