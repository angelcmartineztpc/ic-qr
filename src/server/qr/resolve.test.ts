import { describe, expect, it } from "vitest";

import { applyQrResolution, createRecord } from "@/lib/records/factory";
import { encodeMatrix } from "@/lib/qr/encode";
import { renderQrSvg } from "@/lib/qr/render-svg";
import { QR_RENDERER_VERSION } from "@/lib/qr/version";
import { StoredRecordSchema } from "@/schemas/record";
import type { StorageProvider } from "@/types";

import { draft, NOW } from "../../../tests/helpers/records";
import { MemoryStorage } from "../../../tests/helpers/memory-storage";
import { StorageError } from "../storage/keys";
import { contentHashOf, sha256Hex } from "./hash";
import { HourlyQuota } from "./quota";
import { resolveGenerate, type ResolveDeps } from "./resolve";

const MENU = "https://menu.example.com/tropical";
const item = (recordId: string, menuUrl = MENU) => ({ recordId, menuUrl, expectedRevision: 0 });
const NOW_DATE = new Date("2026-10-06T12:00:00.000Z");

function deps(storage: StorageProvider = new MemoryStorage(), overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return { storage, keyPrefix: "", quota: new HourlyQuota(1000), now: () => NOW_DATE, ...overrides };
}

describe("resolveGenerate — sin Link del QR se genera (AC13–AC16)", () => {
  it("genera el SVG, lo sube a qr/v1/{sha256}.svg y devuelve la URL derivada", async () => {
    const storage = new MemoryStorage();
    const summary = await resolveGenerate([item("r1")], deps(storage));
    const hash = contentHashOf(MENU);
    const key = `qr/v1/${hash}.svg`;

    expect(summary).toMatchObject({ created: 1, reused: 0, failed: 0 });
    expect(summary.results[0]).toMatchObject({
      recordId: "r1",
      outcome: "generated",
      qrUrl: `https://cdn.example.com/${key}`,
      qr: { source: "generated", storageKey: key, payload: MENU, contentHash: hash, rendererVersion: QR_RENDERER_VERSION, generatedAt: NOW_DATE.toISOString() },
    });
    // El archivo almacenado es un SVG vectorial, byte a byte el canónico, y lleva sus metadatos.
    const stored = storage.objects.get(key);
    const svg = new TextDecoder().decode(stored?.body);
    expect(svg).toBe(renderQrSvg(encodeMatrix(MENU)));
    expect(svg).not.toMatch(/<image|data:/);
    expect(stored?.contentType).toBe("image/svg+xml");
    expect(stored?.metadata).toEqual({ "svg-sha256": sha256Hex(svg), renderer: QR_RENDERER_VERSION });
    expect(summary.results[0]).toMatchObject({ qr: { svgSha256: sha256Hex(svg) } });
  });

  it("el resultado se aplica al registro y cumple el schema de persistencia", async () => {
    const storage = new MemoryStorage();
    const record = createRecord(draft(), { now: NOW, order: 0, origin: "manual", id: "r1" });
    const { results } = await resolveGenerate([item("r1")], deps(storage));
    const updated = applyQrResolution(record, results[0]!, NOW);
    expect(updated).toMatchObject({ qrStatus: "generated", qr: { source: "generated" } });
    expect(updated.qrUrl).toBe(`https://cdn.example.com/qr/v1/${contentHashOf(MENU)}.svg`);
    expect(StoredRecordSchema.safeParse(updated).success).toBe(true);
  });

  it("la clave depende solo del contenido: 50 mesas con el mismo menú comparten 1 archivo", async () => {
    const storage = new MemoryStorage();
    const summary = await resolveGenerate(Array.from({ length: 50 }, (_, i) => item(`r${i}`)), deps(storage));
    expect(storage.objects.size).toBe(1);
    expect(storage.calls.upload).toBe(1);
    expect(summary).toMatchObject({ created: 1, reused: 49, failed: 0 });
    expect(summary.results.filter((r) => r.outcome === "generated")).toHaveLength(1);
    expect(summary.results.filter((r) => r.outcome === "reused")).toHaveLength(49);
  });

  it("menús distintos → archivos distintos", async () => {
    const storage = new MemoryStorage();
    await resolveGenerate([item("a", MENU), item("b", `${MENU}?mesa=2`)], deps(storage));
    expect(storage.objects.size).toBe(2);
  });

  it("una segunda llamada (otra sesión, otra pestaña, reimportación) reutiliza y no crea nada", async () => {
    const storage = new MemoryStorage();
    await resolveGenerate([item("r1")], deps(storage));
    const before = new Map(storage.objects);
    const again = await resolveGenerate([item("r1"), item("r2")], deps(storage));
    expect(again).toMatchObject({ created: 0, reused: 2, failed: 0 });
    expect(again.results.every((r) => r.outcome === "reused")).toBe(true);
    expect([...storage.objects.keys()]).toEqual([...before.keys()]);
  });

  it("20 llamadas simultáneas para el mismo QR crean exactamente 1 archivo", async () => {
    const storage = new MemoryStorage();
    storage.delayMs = 5;
    const runs = await Promise.all(Array.from({ length: 20 }, (_, i) => resolveGenerate([item(`r${i}`)], deps(storage))));
    expect(storage.objects.size).toBe(1);
    expect(runs.reduce((n, r) => n + r.created, 0)).toBe(1);
    expect(runs.flatMap((r) => r.results).filter((r) => r.outcome === "generated")).toHaveLength(1);
  });

  it("normaliza el Link del menú: el payload es la forma canónica", async () => {
    const { results } = await resolveGenerate([item("r1", "HTTPS://Menu.Example.com/tropical")], deps());
    expect(results[0]).toMatchObject({ outcome: "generated", qr: { payload: MENU } });
  });

  it("respeta el prefijo de claves del entorno", async () => {
    const storage = new MemoryStorage();
    const { results } = await resolveGenerate([item("r1")], deps(storage, { keyPrefix: "prod/" }));
    expect(results[0]).toMatchObject({ qr: { storageKey: `prod/qr/v1/${contentHashOf(MENU)}.svg` } });
  });
});

describe("resolveGenerate — REGLA CRÍTICA: con Link del QR nunca se genera (AC12)", () => {
  it.each([
    ["qrUrl", { ...item("r1"), qrUrl: "https://qr.cliente.com/m1.svg" }],
    ["qr", { ...item("r1"), qr: { source: "existing" } }],
    ["qrUrl vacío", { ...item("r1"), qrUrl: "" }],
  ])("un ítem con %s falla sin tocar el storage", async (_name, raw) => {
    const storage = new MemoryStorage();
    const summary = await resolveGenerate([raw], deps(storage));
    expect(summary.results[0]).toMatchObject({ recordId: "r1", outcome: "failed", error: { code: "unsafe-url" } });
    expect(summary).toMatchObject({ created: 0, failed: 1 });
    expect(Object.values(storage.calls).every((n) => n === 0)).toBe(true);
    expect(storage.objects.size).toBe(0);
  });

  it("en un lote mixto solo se genera para los ítems sin Link del QR", async () => {
    const storage = new MemoryStorage();
    const summary = await resolveGenerate([item("sin"), { ...item("con", `${MENU}?m=2`), qrUrl: "https://qr.cliente.com/x.svg" }], deps(storage));
    expect(summary.results.map((r) => [r.recordId, r.outcome])).toEqual([["sin", "generated"], ["con", "failed"]]);
    expect(storage.objects.size).toBe(1);
  });
});

describe("resolveGenerate — validación y errores", () => {
  it.each([
    ["no es una URL", "hola"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>1</script>"],
    ["vacío", ""],
    ["demasiado largo", `https://menu.example.com/${"a".repeat(2100)}`],
  ])("Link del menú inválido (%s) → failed, sin storage", async (_name, menuUrl) => {
    const storage = new MemoryStorage();
    const { results } = await resolveGenerate([item("r1", menuUrl)], deps(storage));
    expect(results[0]).toMatchObject({ outcome: "failed", error: { code: "encode-failed" } });
    expect(storage.calls.upload).toBe(0);
  });

  it("un ítem mal formado no rompe el lote", async () => {
    const { results } = await resolveGenerate([null, 42, { recordId: "x" }, item("ok")], deps());
    expect(results.map((r) => r.outcome)).toEqual(["failed", "failed", "failed", "generated"]);
  });

  it("un fallo de storage se reporta por ítem y el resto del lote sigue", async () => {
    const storage = new MemoryStorage();
    storage.failNext = new StorageError("unavailable", "caído");
    const summary = await resolveGenerate([item("a", MENU), item("b", `${MENU}?b`)], deps(storage, { concurrency: 1 }));
    expect(summary.results.map((r) => r.outcome)).toEqual(["failed", "generated"]);
    expect(summary.results[0]).toMatchObject({ error: { code: "storage-failed" } });
  });

  it("un 403 del bucket explica que es un problema de permisos", async () => {
    const storage = new MemoryStorage();
    storage.failNext = new StorageError("forbidden", "AccessDenied");
    const { results } = await resolveGenerate([item("a")], deps(storage));
    const first = results[0];
    expect(first).toMatchObject({ outcome: "failed", error: { code: "storage-failed" } });
    expect(first?.outcome === "failed" && first.error.message).toContain("permisos");
  });
});

describe("resolveGenerate — objetos ajenos y cuota", () => {
  const key = `qr/v1/${contentHashOf(MENU)}.svg`;

  it("un objeto ajeno en la clave (otro contenido) → storage-conflict: ni se reutiliza ni se sobrescribe", async () => {
    const storage = new MemoryStorage();
    storage.objects.set(key, { body: new TextEncoder().encode("<svg>otro</svg>"), contentType: "image/svg+xml", metadata: { "svg-sha256": "0".repeat(64) } });
    const { results } = await resolveGenerate([item("r1")], deps(storage));
    expect(results[0]).toMatchObject({ outcome: "failed", error: { code: "storage-conflict" } });
    expect(new TextDecoder().decode(storage.objects.get(key)?.body)).toBe("<svg>otro</svg>");
  });

  it("un objeto sin metadatos (subida manual) también es conflicto", async () => {
    const storage = new MemoryStorage();
    storage.objects.set(key, { body: new TextEncoder().encode("<svg/>"), contentType: "image/svg+xml", metadata: {} });
    expect((await resolveGenerate([item("r1")], deps(storage))).results[0]).toMatchObject({ error: { code: "storage-conflict" } });
  });

  it("sin PUT condicional (Supabase): HEAD primero, nunca pisa un objeto ajeno", async () => {
    const storage = new MemoryStorage({ conditionalPut: false, publicRead: true });
    storage.objects.set(key, { body: new TextEncoder().encode("<svg>otro</svg>"), contentType: "image/svg+xml", metadata: {} });
    expect((await resolveGenerate([item("r1")], deps(storage))).results[0]).toMatchObject({ error: { code: "storage-conflict" } });
    expect(storage.calls.upload).toBe(0);

    const fresh = new MemoryStorage({ conditionalPut: false, publicRead: true });
    expect((await resolveGenerate([item("r1")], deps(fresh))).results[0]).toMatchObject({ outcome: "generated" });
    expect((await resolveGenerate([item("r1")], deps(fresh))).results[0]).toMatchObject({ outcome: "reused" });
    expect(fresh.calls.upload).toBe(1);
  });

  it("cuota por hora: los QR nuevos se limitan, pero los que ya existen se siguen reutilizando", async () => {
    const storage = new MemoryStorage();
    const quota = new HourlyQuota(2);
    const urls = [MENU, `${MENU}?2`, `${MENU}?3`];
    const first = await resolveGenerate(urls.map((u, i) => item(`r${i}`, u)), deps(storage, { quota, concurrency: 1 }));
    expect(first.results.map((r) => r.outcome)).toEqual(["generated", "generated", "failed"]);
    expect(first.results[2]).toMatchObject({ error: { code: "quota-exceeded" } });
    expect(storage.objects.size).toBe(2);

    const again = await resolveGenerate([item("a", MENU), item("b", `${MENU}?3`)], deps(storage, { quota }));
    expect(again.results.map((r) => r.outcome)).toEqual(["reused", "failed"]);
  });

  it("la cuota se renueva cada hora", () => {
    let now = 0;
    const quota = new HourlyQuota(1, () => now);
    quota.consume();
    expect(quota.canCreate()).toBe(false);
    now = 3_600_001;
    expect(quota.canCreate()).toBe(true);
    expect(quota.remaining).toBe(1);
  });
});
