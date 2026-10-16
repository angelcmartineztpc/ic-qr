import { describe, expect, it, vi } from "vitest";

import type { ShortenItem } from "@/services/qr-produccion/schemas/links";

import { shortenMany, type ShortenFetcher } from "./shorten-many";

const fake: ShortenFetcher = async (urls) =>
  urls.map((url): ShortenItem => (url.startsWith("https://") ? { url, status: url.includes("viejo") ? "reused" : "created", shortUrl: `https://qr.example.com/s/${url.length.toString().padStart(8, "a")}`, code: "x" } : { url, status: "invalid", message: "no" }));

describe("shortenMany", () => {
  it("acorta, cuenta cada resultado y deja aparte los inválidos", async () => {
    const outcome = await shortenMany(["https://a.example.com/viejo", "https://a.example.com/nuevo", "nada"], fake);
    expect(outcome).toMatchObject({ created: 1, reused: 1, kept: 0, invalid: ["nada"] });
    expect(outcome.map.size).toBe(2);
  });

  it("no manda vacíos ni repetidos", async () => {
    const fetcher = vi.fn(fake);
    await shortenMany(["https://a.example.com/x", " https://a.example.com/x ", "", "   "], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toEqual(["https://a.example.com/x"]);
  });

  it("parte en lotes de 200", async () => {
    const urls = Array.from({ length: 450 }, (_, i) => `https://a.example.com/${i}`);
    const fetcher = vi.fn(fake);
    const outcome = await shortenMany(urls, fetcher);
    expect(fetcher.mock.calls.map((c) => c[0].length)).toEqual([200, 200, 50]);
    expect(outcome.map.size).toBe(450);
  });

  it("un fallo del servidor lanza: nunca devuelve un resultado a medias", async () => {
    let calls = 0;
    const flaky: ShortenFetcher = async (urls) => {
      if (++calls === 2) throw new TypeError("Failed to fetch");
      return fake(urls);
    };
    await expect(shortenMany(Array.from({ length: 450 }, (_, i) => `https://a.example.com/${i}`), flaky)).rejects.toThrow("Failed to fetch");
  });

  it("una respuesta con otro número de elementos se rechaza", async () => {
    await expect(shortenMany(["https://a.example.com/1", "https://a.example.com/2"], async () => [])).rejects.toThrow(/incompleta/);
  });
});
