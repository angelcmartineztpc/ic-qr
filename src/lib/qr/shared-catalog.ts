/**
 * Arquitectura de Escalabilidad de QR Multi-Proyecto:
 * Modela los códigos QR y links cortos como activos compartidos e independientes del proyecto actual.
 * Permite que varios proyectos (placas de mesa, señalética, cartas, etc.) reutilicen el mismo QR
 * vectorial y su link corto (`/s/{código}`) sin regenerar vectores ni perder trazabilidad.
 */
import { isStableResortLink, shortCodeOf } from "@/lib/links/own-links";
import type { QRRecord } from "@/types";

export interface SharedQrAsset {
  /** Identificador canónico del activo (código corto, ruta estable del resort o URL destino). */
  assetKey: string;
  /** Código corto administrado (`…/s/{código}`) si aplica; permite cambiar el destino sin reimprimir en ningún proyecto. */
  shortCode: string | null;
  /** Indica si pertenece al catálogo estable de resorts (`…/api/qr/{resort}/{servicio}`). */
  stableResortLink: boolean;
  /** URL codificada en el QR o destino principal. */
  payloadUrl: string;
  /** URL del vector SVG persistido en almacenamiento compartido (`/api/storage/qr/v1/{sha256}.svg` o externo). */
  vectorUrl?: string;
  /** Origen del activo en la biblioteca. */
  origin: "generated-shared" | "existing-external" | "pending";
  /** IDs de las piezas del proyecto actual que referencian este mismo activo QR. */
  recordIds: string[];
  /** Etiquetas legibles (`Mesa · Área`) de las piezas que comparten este QR. */
  pieceLabels: string[];
  /** Listo para reutilizarse en otros proyectos sin volver a generarse. */
  reusableAcrossProjects: boolean;
}

export interface SharedQrCatalogSummary {
  /** Total de piezas evaluadas en el lote actual. */
  totalPieces: number;
  /** Cantidad de activos QR únicos (un mismo QR puede alimentar varias piezas o proyectos). */
  uniqueAssets: number;
  /** Piezas que reutilizan un QR ya existente en el lote/catálogo. */
  sharedPieceCount: number;
  /** Instancias reutilizadas adicionales dentro del lote (`totalPieces - uniqueAssets`). */
  reusedInstances: number;
  /** Cantidad de códigos cortos únicos (`/s/{código}`). */
  shortCodeCount: number;
  /** Cantidad de recursos QR externos únicos (`Link del QR`). */
  externalCount: number;
  /** Activos ya persistidos en el almacenamiento vectorial y listos para otros proyectos. */
  reusableAssetsCount: number;
  /** Mapa de activos por `assetKey`. */
  assetsByKey: ReadonlyMap<string, SharedQrAsset>;
}

export interface RecordQrAssetInspection {
  assetKey: string;
  shortCode: string | null;
  sharedCount: number;
  isSharedInBatch: boolean;
  reusableAcrossProjects: boolean;
}

export function canonicalAssetKey(record: Pick<QRRecord, "menuUrl" | "qrUrl" | "qr">): string {
  if (record.qr.source === "existing" && record.qrUrl) {
    return `ext:${record.qrUrl.trim().toLowerCase()}`;
  }
  const payload = (record.qr.source === "generated" ? record.qr.payload : record.menuUrl).trim();
  const code = shortCodeOf(payload);
  if (code) return `short:${code}`;
  return `url:${payload.toLowerCase()}`;
}

/** Resume el catálogo de activos QR del lote y detecta reutilización intra e inter-proyecto. */
export function summarizeQrCatalog(records: readonly QRRecord[]): SharedQrCatalogSummary {
  const map = new Map<string, SharedQrAsset>();

  for (const record of records) {
    const key = canonicalAssetKey(record);
    const label = [record.mesa, record.area].filter(Boolean).join(" · ") || "Sin nombre";
    const existing = map.get(key);
    if (existing) {
      existing.recordIds.push(record.id);
      existing.pieceLabels.push(label);
      if (!existing.vectorUrl && record.qrUrl) existing.vectorUrl = record.qrUrl;
      continue;
    }

    const payloadUrl = record.qr.source === "generated" ? record.qr.payload : record.menuUrl;
    const shortCode = shortCodeOf(payloadUrl);
    const stableResort = isStableResortLink(payloadUrl);
    const reusable =
      (record.qr.source === "generated" && Boolean(record.qrUrl)) ||
      (record.qr.source === "existing" && record.qr.verification === "decoded");

    map.set(key, {
      assetKey: key,
      shortCode,
      stableResortLink: stableResort,
      payloadUrl,
      ...(record.qrUrl ? { vectorUrl: record.qrUrl } : {}),
      origin:
        record.qr.source === "generated"
          ? "generated-shared"
          : record.qr.source === "existing"
            ? "existing-external"
            : "pending",
      recordIds: [record.id],
      pieceLabels: [label],
      reusableAcrossProjects: reusable,
    });
  }

  let sharedPieceCount = 0;
  let reusableAssetsCount = 0;
  let shortCodeCount = 0;
  let externalCount = 0;
  for (const asset of map.values()) {
    if (asset.recordIds.length > 1) sharedPieceCount += asset.recordIds.length;
    if (asset.reusableAcrossProjects) reusableAssetsCount += 1;
    if (asset.shortCode) shortCodeCount += 1;
    if (asset.origin === "existing-external") externalCount += 1;
  }

  return {
    totalPieces: records.length,
    uniqueAssets: map.size,
    sharedPieceCount,
    reusedInstances: Math.max(0, records.length - map.size),
    shortCodeCount,
    externalCount,
    reusableAssetsCount,
    assetsByKey: map,
  };
}

/** Devuelve la ficha del activo QR para una pieza concreta dentro del catálogo compartido. */
export function inspectRecordQrAsset(record: QRRecord, catalog?: SharedQrCatalogSummary): RecordQrAssetInspection {
  const key = canonicalAssetKey(record);
  const found = catalog?.assetsByKey.get(key);
  const payloadUrl = record.qr.source === "generated" ? record.qr.payload : record.menuUrl;
  const shortCode = found ? found.shortCode : shortCodeOf(payloadUrl);
  const sharedCount = found ? found.recordIds.length : 1;
  const reusableAcrossProjects = found
    ? found.reusableAcrossProjects
    : (record.qr.source === "generated" && Boolean(record.qrUrl)) ||
      (record.qr.source === "existing" && record.qr.verification === "decoded");

  return {
    assetKey: key,
    shortCode,
    sharedCount,
    isSharedInBatch: sharedCount > 1,
    reusableAcrossProjects,
  };
}

