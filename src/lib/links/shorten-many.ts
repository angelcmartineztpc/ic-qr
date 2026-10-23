import { SHORTEN_MAX_BATCH, type ShortenItem } from "@/schemas/links";

export type ShortenFetcher = (urls: string[], signal?: AbortSignal) => Promise<ShortenItem[]>;

export interface ShortenOutcome {
  /** link original → link que debe guardar la pieza (solo los que se pudieron acortar o ya eran propios). */
  map: Map<string, string>;
  created: number;
  reused: number;
  kept: number;
  /** Links que no se pudieron acortar (inválidos): se dejan como están y su validación los marca. */
  invalid: string[];
}

/**
 * Acorta muchos links en lotes. Un fallo de red o del servidor LANZA (no se devuelve a medias):
 * el que llama decide si reintenta, pero nunca guarda una pieza con un link largo creyendo que ya se acortó.
 */
export async function shortenMany(urls: readonly string[], fetcher: ShortenFetcher, signal?: AbortSignal): Promise<ShortenOutcome> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter((u) => u !== ""))];
  const outcome: ShortenOutcome = { map: new Map(), created: 0, reused: 0, kept: 0, invalid: [] };
  for (let i = 0; i < unique.length; i += SHORTEN_MAX_BATCH) {
    const chunk = unique.slice(i, i + SHORTEN_MAX_BATCH);
    const results = await fetcher(chunk, signal);
    if (results.length !== chunk.length) throw new Error("El servidor devolvió una respuesta incompleta al acortar los links");
    results.forEach((item, index) => {
      const url = chunk[index] as string;
      if (item.status === "invalid" || !item.shortUrl) {
        outcome.invalid.push(url);
        return;
      }
      outcome.map.set(url, item.shortUrl);
      outcome[item.status]++;
    });
  }
  return outcome;
}
