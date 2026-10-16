
import { externalSnapshotKey } from "@/services/qr-produccion/qr/hash-input";
import type { ExternalSnapshot } from "@/services/qr-produccion/schemas/qr-geometry";
import type { ExistingQrSource, QrErrorCode, StorageProvider } from "@/types";

import { SafeFetchError, type SafeFetchResult } from "../net/safe-fetch";
import { decodeExternalGeometry } from "./decode-geometry";
import { sha256Hex } from "./hash";
import { sanitizeExternalSvg, SvgRejectedError } from "./sanitize-svg";

export interface VerifyDeps {
  storage: StorageProvider;
  /** Descarga segura de hosts externos (safeFetch ya configurado con política, tiempo y tamaño). */
  fetchRemote: (url: string) => Promise<SafeFetchResult>;
  keyPrefix: string;
  now: () => Date;
  /**
   * Decodificador del QR. Por defecto rasteriza la geometría saneada con código propio (sin `sharp`, que no
   * existe en Deno) y la lee con el decodificador de `qr`. `undefined` = sin QR legible.
   */
  decode?: (geometry: ExternalSnapshot["geometry"]) => string | undefined;
}

export type VerifyOutcome =
  | { ok: true; qr: ExistingQrSource }
  | { ok: false; error: { code: QrErrorCode; message: string } };

export type AssetKind = "svg" | "raster" | "pdf" | "html" | "unknown";

const startsWith = (bytes: Uint8Array, ...signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** El tipo se decide por los bytes, nunca por la extensión ni por la cabecera Content-Type. */
export function classifyAsset(bytes: Uint8Array): AssetKind {
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47) || startsWith(bytes, 0xff, 0xd8, 0xff) || startsWith(bytes, 0x47, 0x49, 0x46, 0x38)) return "raster";
  if (startsWith(bytes, 0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "raster"; // WebP
  if (startsWith(bytes, 0x42, 0x4d)) return "raster"; // BMP
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46)) return "pdf";
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 2048)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  return "unknown";
}

const fail = (code: QrErrorCode, message: string): VerifyOutcome => ({ ok: false, error: { code, message } });

const FETCH_CODES: Record<SafeFetchError["code"], QrErrorCode> = {
  "unsafe-url": "unsafe-url",
  "host-not-allowed": "host-not-allowed",
  timeout: "timeout",
  unreachable: "unreachable",
  "too-large": "too-large",
};

async function download(qrUrl: string, deps: VerifyDeps): Promise<{ bytes: Uint8Array } | VerifyOutcome> {
  const ownKey = deps.storage.keyFromPublicUrl(qrUrl);
  if (ownKey) {
    try {
      const object = await deps.storage.get(ownKey);
      return object ? { bytes: object.body } : fail("unreachable", "El archivo del QR no existe en el almacenamiento");
    } catch {
      return fail("storage-failed", "No se pudo leer el QR del almacenamiento");
    }
  }
  try {
    return { bytes: (await deps.fetchRemote(qrUrl)).bytes };
  } catch (error) {
    if (error instanceof SafeFetchError) return fail(FETCH_CODES[error.code], error.message);
    return fail("unreachable", "No se pudo descargar el QR");
  }
}

/**
 * Verifica un QR aportado por el usuario (Link del QR). Regla crítica: esto
 * NUNCA genera un QR. Descarga el recurso, comprueba que es un SVG de verdad,
 * lo sanea, lo decodifica y guarda su geometría saneada como instantánea
 * (la exportación imprimirá esa instantánea, sin salir a la red).
 */
export async function verifyExistingQr(qrUrl: string, deps: VerifyDeps): Promise<VerifyOutcome> {
  const downloaded = await download(qrUrl, deps);
  if (!("bytes" in downloaded)) return downloaded;
  const { bytes } = downloaded;

  switch (classifyAsset(bytes)) {
    case "raster":
      return fail("raster-only", "El Link del QR es una imagen (PNG/JPG). Un QR vectorial necesita el SVG: sube el SVG o reemplázalo por un QR generado");
    case "pdf":
      return fail("unsupported-type", "Los PDF no se admiten como QR existente; usa el SVG");
    case "html":
      return fail("not-an-image", "El link devuelve una página web, no un archivo de QR. ¿Es un enlace de destino en lugar del SVG del QR?");
    case "unknown":
      return fail("not-an-image", "El link no es un archivo SVG");
    case "svg":
      break;
  }

  let geometry;
  try {
    geometry = sanitizeExternalSvg(bytes);
  } catch (error) {
    if (error instanceof SvgRejectedError) return fail("invalid-svg", `SVG no admitido: ${error.message}`);
    throw error;
  }

  const assetSha256 = sha256Hex(bytes);
  const decodedPayload = (deps.decode ?? decodeExternalGeometry)(geometry);

  const snapshotKey = externalSnapshotKey(assetSha256, deps.keyPrefix);
  const snapshot: ExternalSnapshot = { v: 1, assetSha256, geometry };
  try {
    await deps.storage.upload(snapshotKey, JSON.stringify(snapshot), { contentType: "application/json", cacheControl: "public, max-age=31536000, immutable", ifNoneMatch: true });
  } catch {
    return fail("storage-failed", "No se pudo guardar la instantánea del QR");
  }

  return {
    ok: true,
    qr: {
      source: "existing",
      assetKind: "svg",
      verification: decodedPayload === undefined ? "undecodable" : "decoded",
      assetSha256,
      snapshotKey,
      ...(decodedPayload === undefined ? {} : { decodedPayload }),
      ...(geometry.strokeBased ? { strokeBased: true } : {}),
      checkedAt: deps.now().toISOString(),
    },
  };
}
