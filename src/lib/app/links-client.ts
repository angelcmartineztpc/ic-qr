import type { ShortenFetcher } from "@/lib/links/shorten-many";
import { LinkInfoSchema, ShortenResponseSchema, type LinkInfo } from "@/schemas/links";

import { ApiError, postJson } from "./api-client";

const SHORTEN_HTTP_CHUNK = 25;

/** Acortado en el servidor (`POST /api/links/shorten`), fraccionado en sub-lotes ligeros para Workers. */
export const shortenFetcher: ShortenFetcher = async (urls, signal) => {
  const allResults = [];
  for (let i = 0; i < urls.length; i += SHORTEN_HTTP_CHUNK) {
    const chunk = urls.slice(i, i + SHORTEN_HTTP_CHUNK);
    const response = ShortenResponseSchema.safeParse(await postJson<unknown>("/api/links/shorten", { urls: chunk }, signal));
    if (!response.success) throw new ApiError(502, "BAD_RESPONSE", "El servidor respondió algo inesperado al acortar los links");
    allResults.push(...response.data.results);
  }
  return allResults;
};

async function readInfo(response: Response): Promise<LinkInfo> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "HTTP_ERROR", `El servidor respondió ${response.status}`);
  }
  if (!response.ok) {
    const error = payload as { code?: string; message?: string; requestId?: string };
    throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? `El servidor respondió ${response.status}`, error.requestId);
  }
  const parsed = LinkInfoSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, "BAD_RESPONSE", "El servidor respondió algo inesperado");
  return parsed.data;
}

/** Destino vigente e historial de un link corto. */
export async function getLinkInfo(code: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<LinkInfo> {
  return readInfo(await fetchImpl(`/api/links/${code}`, { ...(signal ? { signal } : {}) }));
}

/** Cambia a dónde lleva el link (el código y el QR impreso no cambian). `revision` evita pisar un cambio ajeno. */
export async function updateLinkDestination(code: string, destination: string, revision?: number, fetchImpl: typeof fetch = fetch): Promise<LinkInfo> {
  return readInfo(await fetchImpl(`/api/links/${code}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(revision === undefined ? {} : { "If-Match": `"${revision}"` }) }, body: JSON.stringify({ destination }) }));
}
