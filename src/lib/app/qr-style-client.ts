import type { QrLogoGeometry } from "@/schemas/qr-style";

import { ApiError } from "./api-client";

export const MAX_LOGO_BYTES = 512 * 1024;

/** Validación previa en el navegador, solo por comodidad: el servidor vuelve a comprobarlo todo. */
export function checkLogoBeforeUpload(file: Pick<File, "name" | "size">): string | null {
  if (!/\.svg$/i.test(file.name)) return "El logo debe ser un archivo .svg. Si lo tienes en PNG o JPG, vectorízalo primero (la placa necesita contornos, no píxeles).";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_LOGO_BYTES) return `El logo pesa ${(file.size / 1024).toFixed(0)} KB y el máximo es ${MAX_LOGO_BYTES / 1024} KB. Simplifica el dibujo.`;
  return null;
}

/** Sube el SVG para sanearlo en el servidor y devuelve la geometría lista para guardar. */
export async function uploadLogo(file: File, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<QrLogoGeometry> {
  const response = await fetchImpl("/api/qr/logo", { method: "POST", headers: { "Content-Type": "image/svg+xml" }, body: file, ...(signal ? { signal } : {}) });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "HTTP_ERROR", `El servidor respondió ${response.status}`);
  }
  if (response.ok) return (payload as { geometry: QrLogoGeometry }).geometry;
  const error = payload as { code?: string; message?: string; requestId?: string };
  throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? `El servidor respondió ${response.status}`, error.requestId);
}
