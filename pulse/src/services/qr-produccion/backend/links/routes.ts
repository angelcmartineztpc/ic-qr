import { shortUrlFor } from "@/services/qr-produccion/links/own-links";
import { ShortCodeSchema, type LinkInfo, type ShortLink } from "@/services/qr-produccion/schemas/links";

import { HttpError } from "../http/errors";
import { LinkError } from "./service";

export type LinksRoute =
  | { kind: "shorten" }
  | { kind: "records-excel" }
  | { kind: "redirect"; code: string }
  | { kind: "stable"; pathname: string }
  | { kind: "info"; code: string }
  | { kind: "update"; code: string }
  | { kind: "not-found" };

/**
 * Rutas de `qr-enlaces` (el nombre de la función y `/functions/v1` pueden ir delante o no):
 *   POST shorten · POST records-excel · GET s/{código} (pública) · GET/PATCH links/{código} · GET api/qr/{resort}/{servicio} (pública)
 */
export function routeLinks(method: string, pathname: string, functionName = "qr-enlaces"): LinksRoute {
  const segments = pathname.split("/").filter(Boolean);
  const at = segments.indexOf(functionName);
  const rest = at >= 0 ? segments.slice(at + 1) : segments;
  const [first, second] = rest;
  if (rest.length === 1 && first === "shorten" && method === "POST") return { kind: "shorten" };
  if (rest.length === 1 && first === "records-excel" && method === "POST") return { kind: "records-excel" };
  if (rest.length === 2 && first === "s" && method === "GET" && second) return { kind: "redirect", code: second.toLowerCase() };
  if (rest.length === 2 && first === "links" && second) {
    if (method === "GET") return { kind: "info", code: second.toLowerCase() };
    if (method === "PATCH") return { kind: "update", code: second.toLowerCase() };
  }
  if (rest.length === 4 && first === "api" && second === "qr" && method === "GET") return { kind: "stable", pathname };
  return { kind: "not-found" };
}

/** Lo que ve la interfaz: el registro sin su versión interna (`v`) y con el link corto ya armado. */
export const infoOf = (link: ShortLink, base: string): LinkInfo => ({
  code: link.code,
  shortUrl: shortUrlFor(base, link.code),
  destination: link.destination,
  originalUrl: link.originalUrl,
  createdAt: link.createdAt,
  updatedAt: link.updatedAt,
  revision: link.revision,
  history: link.history,
});

/** Código de la URL, validado: uno mal formado es «no existe» (404), no «petición inválida». */
export function validCode(raw: string): string {
  const parsed = ShortCodeSchema.safeParse(raw.toLowerCase());
  if (!parsed.success) throw new HttpError(404, "NOT_FOUND", "Este link corto no existe");
  return parsed.data;
}

export function linkErrorToHttp(error: unknown): never {
  if (error instanceof LinkError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "EXHAUSTED" ? 503 : 400;
    throw new HttpError(status, error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "EXHAUSTED" ? "INTERNAL" : "VALIDATION_FAILED", error.message);
  }
  throw error;
}

/** `If-Match: "3"` → 3. Sin cabecera, undefined (no se comprueba la revisión). */
export function revisionFromIfMatch(header: string | null): number | undefined {
  if (header === null) return undefined;
  const revision = Number(header.replaceAll('"', ""));
  if (!Number.isInteger(revision)) throw new HttpError(400, "VALIDATION_FAILED", "If-Match debe ser el número de revisión");
  return revision;
}

/** Base pública de los links cortos: el dominio permanente configurado, o la URL de la propia función. */
export function linkBase(configured: string | undefined, fallback: string): string {
  return (configured?.trim() || fallback).replace(/\/+$/, "");
}

/** Hosts que son «nuestros»: un link con otro host nunca se toma por propio. */
export function ownHostsOf(base: string, extra: readonly string[] = []): string[] {
  const host = URL.parse(base)?.host;
  return [...new Set([...extra, ...(host ? [host] : [])])];
}
