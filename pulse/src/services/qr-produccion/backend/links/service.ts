import { isStableResortLink, ownBasePath, shortCodeOf, shortUrlFor } from "@/services/qr-produccion/links/own-links";
import { DestinationSchema, SHORT_LINK_HISTORY_MAX, type ShortenItem, type ShortLink } from "@/services/qr-produccion/schemas/links";
import { MenuUrlSchema } from "@/services/qr-produccion/schemas/url";

import { mapWithConcurrency } from "../util/limiter";
import { shortCodeFor } from "./code";
import { RevisionConflictError, type ShortLinkRepository } from "./repository";

export interface LinkDeps {
  repo: ShortLinkRepository;
  /** `https://dominio` sobre el que se arma el link corto (sin barra final). */
  base: string;
  /** Hosts que son «nuestros»: un link con otro host nunca se toma por propio. */
  ownHosts: readonly string[];
  now(): string;
  /** Se llama tras cambiar un destino (para vaciar la caché del redirect). */
  onChanged?(code: string): void;
}

/** Intentos para encontrar un código libre antes de rendirse (con 2^40 códigos no debería pasar de 1). */
export const MAX_ATTEMPTS = 10;

export class LinkError extends Error {
  constructor(
    readonly code: "INVALID_DESTINATION" | "NOT_FOUND" | "CONFLICT" | "EXHAUSTED",
    message: string,
  ) {
    super(message);
    this.name = "LinkError";
  }
}

const isOwnHost = (url: string, deps: LinkDeps): boolean => {
  const host = URL.parse(url)?.host;
  return host !== undefined && deps.ownHosts.includes(host);
};

async function shortenOne(normalized: string, deps: LinkDeps): Promise<Omit<ShortenItem, "url">> {
  // Links que la herramienta ya controla: no se acortan otra vez.
  if (isOwnHost(normalized, deps)) {
    const basePath = ownBasePath(deps.base);
    if (isStableResortLink(normalized, basePath)) return { status: "kept", shortUrl: normalized };
    const own = shortCodeOf(normalized, basePath);
    if (own !== null) {
      if (await deps.repo.get(own)) return { status: "kept", shortUrl: shortUrlFor(deps.base, own), code: own };
      return { status: "invalid", message: "Este link corto no existe en la herramienta" };
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = shortCodeFor(normalized, attempt);
    const existing = await deps.repo.get(code);
    if (existing) {
      if (existing.originalUrl === normalized) return { status: "reused", shortUrl: shortUrlFor(deps.base, code), code };
      continue; // el código lo usa otro link: siguiente intento, siempre el mismo orden
    }
    const at = deps.now();
    const link: ShortLink = { v: 1, code, destination: normalized, originalUrl: normalized, createdAt: at, updatedAt: at, revision: 1, history: [] };
    if ((await deps.repo.create(link)) === "created") return { status: "created", shortUrl: shortUrlFor(deps.base, code), code };
    // Otra petición lo creó entre medias: se relee para saber si era este mismo link.
    const raced = await deps.repo.get(code);
    if (raced?.originalUrl === normalized) return { status: "reused", shortUrl: shortUrlFor(deps.base, code), code };
  }
  throw new LinkError("EXHAUSTED", "No se pudo asignar un código al link");
}

/**
 * Acorta una lista de links del menú. Idempotente: el mismo link da siempre el mismo código,
 * se repita la llamada, se pierda el estado del navegador o se reimporte el Excel.
 * Un link inválido no detiene al resto: vuelve con `status: "invalid"` y su motivo.
 */
export async function shortenUrls(urls: readonly string[], deps: LinkDeps, concurrency = 8): Promise<ShortenItem[]> {
  const normalizedOf = new Map<string, string | { message: string }>();
  for (const raw of urls) {
    if (normalizedOf.has(raw)) continue;
    const parsed = MenuUrlSchema.safeParse(raw);
    normalizedOf.set(raw, parsed.success ? parsed.data : { message: parsed.error.issues[0]?.message ?? "El link no es válido" });
  }
  const unique = [...new Set([...normalizedOf.values()].filter((v): v is string => typeof v === "string"))];
  const outcomes = new Map<string, Omit<ShortenItem, "url">>();
  const settled = await mapWithConcurrency(unique, concurrency, (url) => shortenOne(url, deps));
  unique.forEach((url, i) => outcomes.set(url, settled[i] as Omit<ShortenItem, "url">));

  return urls.map((raw): ShortenItem => {
    const normalized = normalizedOf.get(raw);
    if (typeof normalized !== "string") return { url: raw, status: "invalid", message: normalized?.message ?? "El link no es válido" };
    return { url: raw, ...(outcomes.get(normalized) as Omit<ShortenItem, "url">) };
  });
}

export async function getLink(code: string, deps: LinkDeps): Promise<ShortLink> {
  const link = await deps.repo.get(code);
  if (!link) throw new LinkError("NOT_FOUND", "Este link corto no existe");
  return link;
}

/** Cambia a dónde lleva un link corto. El código, y por tanto el QR impreso, no cambia. */
export async function updateDestination(code: string, rawDestination: string, deps: LinkDeps, expectedRevision?: number): Promise<ShortLink> {
  const parsed = DestinationSchema.safeParse(rawDestination);
  if (!parsed.success) throw new LinkError("INVALID_DESTINATION", parsed.error.issues[0]?.message ?? "El destino no es válido");
  const destination = parsed.data;
  // Un destino que apunta a un link corto propio formaría un bucle (o una cadena de saltos sin sentido).
  if (isOwnHost(destination, deps) && shortCodeOf(destination, ownBasePath(deps.base)) !== null) throw new LinkError("INVALID_DESTINATION", "El destino no puede ser otro link corto de la herramienta");
  try {
    const updated = await deps.repo.updateDestination(code, destination, deps.now(), expectedRevision);
    if (!updated) throw new LinkError("NOT_FOUND", "Este link corto no existe");
    deps.onChanged?.(code);
    return updated;
  } catch (error) {
    if (error instanceof RevisionConflictError) throw new LinkError("CONFLICT", error.message);
    throw error;
  }
}

export { SHORT_LINK_HISTORY_MAX };
