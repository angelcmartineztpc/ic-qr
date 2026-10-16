/**
 * Claves de objetos (docs/ARCHITECTURE.md §S3). Se validan con esta regex
 * ANTES de cada llamada al storage: es la defensa contra rutas inventadas
 * (../, claves ajenas) tanto en disco como en el bucket.
 *   [prefijo/]qr/v1/{sha256}.svg        QR generado
 *   [prefijo/]qr/ext/v1/{sha256}.json   instantánea de un QR externo
 *   [prefijo/]s/v1/{código}.json        link corto (NUNCA se sirve públicamente)
 */
import type { StorageErrorCode } from "@/types";

export const KEY_PATTERN = /^(?:[a-z0-9][a-z0-9-]*\/)?qr\/(?:v\d+\/[0-9a-f]{64}\.svg|ext\/v\d+\/[0-9a-f]{64}\.json)$/;

/** Registro de un link corto. Es de uso interno: ninguna ruta pública lo entrega (solo `isValidKey` abre archivos al exterior). */
export const LINK_KEY_PATTERN = /^(?:[a-z0-9][a-z0-9-]*\/)?s\/v1\/[2-9a-hjkmnp-z]{8}\.json$/;

/** Clave de un QR o de una instantánea: lo único que sirven `/api/storage` y `/api/qr/asset`. */
export const isValidKey = (key: string): boolean => KEY_PATTERN.test(key);

/** Cualquier objeto que gestiona la aplicación (QR, instantáneas y links cortos). */
export const isManagedKey = (key: string): boolean => KEY_PATTERN.test(key) || LINK_KEY_PATTERN.test(key);

/** `[prefijo/]s/v1/{código}.json` */
export function linkStorageKey(code: string, prefix = ""): string {
  const normalized = prefix === "" ? "" : prefix.endsWith("/") ? prefix : `${prefix}/`;
  const key = `${normalized}s/v1/${code}.json`;
  if (!LINK_KEY_PATTERN.test(key)) throw new StorageError("invalid-key", `Clave de link no válida: ${key.slice(0, 120)}`);
  return key;
}

export function assertValidKey(key: string): void {
  if (!isManagedKey(key)) throw new StorageError("invalid-key", `Clave de storage no válida: ${key.slice(0, 120)}`);
}

export const contentTypeForKey = (key: string): "image/svg+xml" | "application/json" => (key.endsWith(".svg") ? "image/svg+xml" : "application/json");

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

/** Decodifica la URL pública a su clave si pertenece a `publicBase`; null si no (sin red, sin SSRF). */
export function keyFromPublicUrl(url: string, publicBase: string): string | null {
  const parsed = URL.parse(url);
  const base = URL.parse(publicBase.endsWith("/") ? publicBase : `${publicBase}/`);
  if (!parsed || !base) return null;
  if (parsed.origin !== base.origin || parsed.search !== "" || parsed.hash !== "") return null;
  if (!parsed.pathname.startsWith(base.pathname)) return null;
  let key: string;
  try {
    key = decodeURIComponent(parsed.pathname.slice(base.pathname.length));
  } catch {
    return null;
  }
  return isValidKey(key) ? key : null;
}

export function publicUrlFor(key: string, publicBase: string): string {
  assertValidKey(key);
  return `${publicBase.replace(/\/+$/, "")}/${key}`;
}
