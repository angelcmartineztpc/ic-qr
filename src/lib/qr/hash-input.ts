import { QR_ASSET_MARGIN_MODULES, QR_RENDERER_VERSION } from "./version";

/**
 * Entrada del hash de contenido (§S2.2). La clave del archivo en el storage
 * es qr/v1/sha256(hashInput).svg: el mismo QR (mismo contenido y mismo
 * renderer) siempre cae en el mismo archivo. Esto implementa la regla de no
 * duplicar QR: reintentos, pestañas duplicadas o reimportaciones no crean archivos nuevos.
 */
export function hashInput(payload: string): string {
  return JSON.stringify({
    v: 1,
    payload,
    ecc: "high",
    margin: QR_ASSET_MARGIN_MODULES,
    dark: "#000000",
    light: "#FFFFFF",
    renderer: QR_RENDERER_VERSION,
  });
}

export const QR_KEY_VERSION = "v1";

/** Clave del asset: [prefijo/]qr/v1/{sha256}.svg */
export function qrStorageKey(contentHash: string, prefix = ""): string {
  const normalized = prefix === "" ? "" : prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalized}qr/${QR_KEY_VERSION}/${contentHash}.svg`;
}

/** Instantánea de la geometría saneada de un QR externo: [prefijo/]qr/ext/v1/{assetSha256}.json */
export function externalSnapshotKey(assetSha256: string, prefix = ""): string {
  const normalized = prefix === "" ? "" : prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalized}qr/ext/${QR_KEY_VERSION}/${assetSha256}.json`;
}
