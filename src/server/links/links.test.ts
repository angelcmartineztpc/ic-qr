import { describe, expect, it } from "vitest";

import { SHORT_CODE_PATTERN } from "@/schemas/links";

import { MemoryStorage } from "../../../tests/helpers/memory-storage";
import { shortCodeFor } from "./code";
import { ObjectShortLinkRepository } from "./object-repository";
import { RedirectCache } from "./redirect-cache";
import { isManagedKey, isValidKey, linkStorageKey } from "../storage/keys";
import { getLink, LinkError, MAX_ATTEMPTS, shortenUrls, updateDestination, type LinkDeps } from "./service";

const BASE = "https://qr.example.com";
const LONG = "https://menu.palaceresorts.com/restaurant/leblanc-los-cabos/carta?utm_source=qr&utm_medium=mesa&utm_campaign=2026&id=abcdefghijklmnopqrstuvwxyz0123456789";
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 14, 12, 0, tick++)).toISOString();

function setup() {
  const storage = new MemoryStorage();
  const repo = new ObjectShortLinkRepository(storage);
  const changed: string[] = [];
  const deps: LinkDeps = { repo, base: BASE, ownHosts: ["qr.example.com", "localhost:3000"], now: clock, onChanged: (code) => changed.push(code) };
  return { storage, repo, deps, changed };
}

describe("código", () => {
  it("es determinista, de 8 caracteres y del alfabeto sin ambiguos", () => {
    const code = shortCodeFor(LONG);
    expect(code).toBe(shortCodeFor(LONG));
    expect(code).toMatch(SHORT_CODE_PATTERN);
    expect(shortCodeFor(`${LONG}&x=1`)).not.toBe(code);
  });

  it("cada intento da un código distinto (resolución de colisiones)", () => {
    const codes = new Set(Array.from({ length: MAX_ATTEMPTS }, (_, i) => shortCodeFor(LONG, i)));
    expect(codes.size).toBe(MAX_ATTEMPTS);
  });

  it("reparte bien: 5000 links distintos no repiten código", () => {
    const codes = new Set(Array.from({ length: 5000 }, (_, i) => shortCodeFor(`https://menu.example.com/${i}`)));
    expect(codes.size).toBe(5000);
  });
});

describe("acortar", () => {
  it("crea el link corto y la segunda vez lo reutiliza con el mismo código", async () => {
    const { deps, storage } = setup();
    const [first] = await shortenUrls([LONG], deps);
    expect(first).toMatchObject({ url: LONG, status: "created" });
    expect(first?.shortUrl).toBe(`${BASE}/s/${first?.code}`);
    const [second] = await shortenUrls([LONG], deps);
    expect(second).toMatchObject({ status: "reused", code: first?.code, shortUrl: first?.shortUrl });
    expect([...storage.objects.keys()]).toHaveLength(1);
  });

  it("el link corto es mucho más corto que el original", async () => {
    const { deps } = setup();
    const [item] = await shortenUrls([LONG], deps);
    expect(item?.shortUrl?.length).toBeLessThan(LONG.length / 2);
  });

  it("filas repetidas en el mismo lote comparten un solo registro, y se conserva el orden", async () => {
    const { deps, storage } = setup();
    const other = "https://menu.example.com/otra-carta";
    const results = await shortenUrls([LONG, other, LONG], deps);
    expect(results.map((r) => r.url)).toEqual([LONG, other, LONG]);
    expect(results[0]?.code).toBe(results[2]?.code);
    expect(results[0]?.code).not.toBe(results[1]?.code);
    expect(storage.objects.size).toBe(2);
  });

  it("escribir el mismo link con otra forma (host en mayúsculas) da el mismo código", async () => {
    const { deps } = setup();
    const [a] = await shortenUrls(["https://MENU.example.com/carta"], deps);
    const [b] = await shortenUrls(["https://menu.example.com/carta"], deps);
    expect(a?.code).toBe(b?.code);
  });

  it("un link inválido no detiene al resto y explica por qué", async () => {
    const { deps } = setup();
    const results = await shortenUrls(["no es un link", LONG, "javascript:alert(1)", ""], deps);
    expect(results.map((r) => r.status)).toEqual(["invalid", "created", "invalid", "invalid"]);
    expect(results[0]?.message).toBeTruthy();
    expect(results[0]).not.toHaveProperty("shortUrl");
  });

  it("un link corto propio que existe se conserva, y uno que no existe es inválido", async () => {
    const { deps } = setup();
    const [made] = await shortenUrls([LONG], deps);
    const [kept] = await shortenUrls([made?.shortUrl ?? ""], deps);
    expect(kept).toMatchObject({ status: "kept", code: made?.code, shortUrl: made?.shortUrl });
    const [unknown] = await shortenUrls([`${BASE}/s/zzzzzzzz`], deps);
    expect(unknown).toMatchObject({ status: "invalid" });
  });

  it("el link estable de un resort se conserva sin acortar", async () => {
    const { deps, storage } = setup();
    const [item] = await shortenUrls([`${BASE}/api/qr/TGPC/pool`], deps);
    expect(item).toMatchObject({ status: "kept", shortUrl: `${BASE}/api/qr/TGPC/pool` });
    expect(storage.objects.size).toBe(0);
  });

  it("un link con forma /s/… pero de otro dominio NO se toma por propio: se acorta", async () => {
    const { deps } = setup();
    const [item] = await shortenUrls(["https://otro.example.org/s/ab3de9xk"], deps);
    expect(item?.status).toBe("created");
  });

  it("si el código lo usa otro link, toma el siguiente intento sin pisar nada", async () => {
    const { deps, repo, storage } = setup();
    // Un registro ajeno ocupa el primer código de LONG.
    const squatter = shortCodeFor(LONG, 0);
    await repo.create({ v: 1, code: squatter, destination: "https://otro.example.com/", originalUrl: "https://otro.example.com/", createdAt: clock(), updatedAt: clock(), revision: 1, history: [] });
    const [item] = await shortenUrls([LONG], deps);
    expect(item).toMatchObject({ status: "created", code: shortCodeFor(LONG, 1) });
    expect((await repo.get(squatter))?.destination).toBe("https://otro.example.com/");
    expect(storage.objects.size).toBe(2);
    // Y repetirlo vuelve a dar el segundo código.
    expect((await shortenUrls([LONG], deps))[0]).toMatchObject({ status: "reused", code: shortCodeFor(LONG, 1) });
  });

  it("dos peticiones simultáneas con el mismo link terminan con un solo registro", async () => {
    const { deps, storage } = setup();
    storage.delayMs = 5;
    const [a, b] = await Promise.all([shortenUrls([LONG], deps), shortenUrls([LONG], deps)]);
    expect(a[0]?.code).toBe(b[0]?.code);
    expect([a[0]?.status, b[0]?.status].sort()).toEqual(["created", "reused"]);
    expect(storage.objects.size).toBe(1);
  });
});

describe("cambiar el destino", () => {
  it("cambia a dónde lleva, conserva el código, y guarda el anterior en el historial", async () => {
    const { deps, changed } = setup();
    const [made] = await shortenUrls([LONG], deps);
    const code = made?.code ?? "";
    const updated = await updateDestination(code, "https://nuevo.example.com/menu", deps);
    expect(updated).toMatchObject({ code, destination: "https://nuevo.example.com/menu", originalUrl: LONG, revision: 2 });
    expect(updated.history).toEqual([{ destination: LONG, at: updated.updatedAt }]);
    expect(changed).toEqual([code]);
    // Volver a acortar el link ORIGINAL no pisa el destino editado.
    const [again] = await shortenUrls([LONG], deps);
    expect(again).toMatchObject({ status: "reused", code });
    expect((await getLink(code, deps)).destination).toBe("https://nuevo.example.com/menu");
  });

  it("rechaza un destino inválido, con credenciales o que sea otro link corto propio", async () => {
    const { deps } = setup();
    const [made] = await shortenUrls([LONG], deps);
    const code = made?.code ?? "";
    for (const bad of ["no es un link", "https://user:pass@example.com/", "ftp://example.com/", `${BASE}/s/ab3de9xk`]) {
      await expect(updateDestination(code, bad, deps), bad).rejects.toMatchObject({ code: "INVALID_DESTINATION" });
    }
    expect((await getLink(code, deps)).destination).toBe(LONG);
  });

  it("un código que no existe da NOT_FOUND", async () => {
    const { deps } = setup();
    await expect(updateDestination("zzzzzzzz", "https://x.example.com/", deps)).rejects.toBeInstanceOf(LinkError);
    await expect(getLink("zzzzzzzz", deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("si otra persona cambió el link mientras tanto, avisa (CONFLICT) y no pisa", async () => {
    const { deps } = setup();
    const [made] = await shortenUrls([LONG], deps);
    const code = made?.code ?? "";
    await updateDestination(code, "https://a.example.com/", deps, 1);
    await expect(updateDestination(code, "https://b.example.com/", deps, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getLink(code, deps)).destination).toBe("https://a.example.com/");
  });

  it("el historial se limita a 20 entradas, las más recientes primero", async () => {
    const { deps } = setup();
    const [made] = await shortenUrls([LONG], deps);
    const code = made?.code ?? "";
    for (let i = 0; i < 25; i++) await updateDestination(code, `https://d${i}.example.com/`, deps);
    const link = await getLink(code, deps);
    expect(link.history).toHaveLength(20);
    expect(link.history[0]?.destination).toBe("https://d23.example.com/");
  });
});

describe("repositorio de objetos", () => {
  it("usa el prefijo y no sobrescribe al crear", async () => {
    const storage = new MemoryStorage();
    const repo = new ObjectShortLinkRepository(storage, "prod");
    const link = { v: 1 as const, code: "ab3de9xk", destination: "https://a.example.com/", originalUrl: "https://a.example.com/", createdAt: clock(), updatedAt: clock(), revision: 1, history: [] };
    expect(await repo.create(link)).toBe("created");
    expect(await repo.create({ ...link, destination: "https://b.example.com/" })).toBe("exists");
    expect([...storage.objects.keys()]).toEqual(["prod/s/v1/ab3de9xk.json"]);
    expect((await repo.get("ab3de9xk"))?.destination).toBe("https://a.example.com/");
  });

  it("un archivo dañado o con otro código se trata como inexistente", async () => {
    const storage = new MemoryStorage();
    const repo = new ObjectShortLinkRepository(storage);
    storage.objects.set("s/v1/ab3de9xk.json", { body: new TextEncoder().encode("{ no es json"), contentType: "application/json", metadata: {} });
    expect(await repo.get("ab3de9xk")).toBeNull();
    storage.objects.set("s/v1/ab3de9xk.json", { body: new TextEncoder().encode(JSON.stringify({ v: 1, code: "zzzzzzzz" })), contentType: "application/json", metadata: {} });
    expect(await repo.get("ab3de9xk")).toBeNull();
  });
});

describe("claves de storage de los links", () => {
  it("el registro de un link es una clave gestionada, pero NUNCA una clave pública de QR", () => {
    const key = linkStorageKey("ab3de9xk", "prod");
    expect(key).toBe("prod/s/v1/ab3de9xk.json");
    expect(isManagedKey(key)).toBe(true);
    expect(isValidKey(key)).toBe(false); // /api/storage y /api/qr/asset solo sirven claves de QR
  });

  it("rechaza códigos y rutas inventadas", () => {
    for (const code of ["AB3DE9XK", "ab3de9x", "../../x", "ab3de9x0"]) expect(() => linkStorageKey(code), code).toThrow();
    expect(isManagedKey("s/v1/../qr/v1/x.json")).toBe(false);
  });
});

describe("caché del redirect", () => {
  it("guarda el destino hasta que vence y distingue «no existe» de «no está en caché»", () => {
    let now = 1000;
    const cache = new RedirectCache(() => now, 30_000);
    expect(cache.get("ab3de9xk")).toBeUndefined();
    cache.set("ab3de9xk", "https://a.example.com/");
    cache.set("zzzzzzzz", null);
    expect(cache.get("ab3de9xk")).toBe("https://a.example.com/");
    expect(cache.get("zzzzzzzz")).toBeNull();
    now += 30_001;
    expect(cache.get("ab3de9xk")).toBeUndefined();
  });

  it("delete vacía un código (tras cambiar su destino)", () => {
    const cache = new RedirectCache();
    cache.set("ab3de9xk", "https://a.example.com/");
    cache.delete("ab3de9xk");
    expect(cache.get("ab3de9xk")).toBeUndefined();
  });
});
