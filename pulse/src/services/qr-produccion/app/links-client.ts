import type { ShortenFetcher } from "@/services/qr-produccion/links/shorten-many";
import { LinkInfoSchema, ShortenResponseSchema, type LinkInfo } from "@/services/qr-produccion/schemas/links";

import { ApiError, authedFetch, errorFromResponse, functionUrl, postJson } from "./api-client";

/** Acortado en el servidor (`POST qr-enlaces/shorten`). */
export const shortenFetcher: ShortenFetcher = async (urls, signal) => {
  const response = ShortenResponseSchema.safeParse(await postJson<unknown>(functionUrl("qr-enlaces", "/shorten"), { urls }, signal));
  if (!response.success) throw new ApiError(502, "BAD_RESPONSE", "El servidor respondió algo inesperado al acortar los links");
  return response.data.results;
};

async function readInfo(response: Response): Promise<LinkInfo> {
  if (!response.ok) throw await errorFromResponse(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "HTTP_ERROR", `El servidor respondió ${response.status}`);
  }
  const parsed = LinkInfoSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, "BAD_RESPONSE", "El servidor respondió algo inesperado");
  return parsed.data;
}

/** Destino vigente e historial de un link corto. */
export async function getLinkInfo(code: string, signal?: AbortSignal, fetchImpl: typeof fetch = authedFetch): Promise<LinkInfo> {
  return readInfo(await fetchImpl(functionUrl("qr-enlaces", `/links/${code}`), { ...(signal ? { signal } : {}) }));
}

/** Cambia a dónde lleva el link (el código y el QR impreso no cambian). `revision` evita pisar un cambio ajeno. */
export async function updateLinkDestination(code: string, destination: string, revision?: number, fetchImpl: typeof fetch = authedFetch): Promise<LinkInfo> {
  return readInfo(await fetchImpl(functionUrl("qr-enlaces", `/links/${code}`), { method: "PATCH", headers: { "Content-Type": "application/json", ...(revision === undefined ? {} : { "If-Match": `"${revision}"` }) }, body: JSON.stringify({ destination }) }));
}
