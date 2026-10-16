import { describe, expect, it } from "vitest";

import { sha256Hex } from "../util/sha256";
import { StorageError } from "./keys";
import { SupabaseStorageProvider, type AssetCatalog, type BucketError, type CatalogEntry, type ObjectBucket } from "./supabase-storage";

const HASH = "a".repeat(64);
const KEY = `qr/v1/${HASH}.svg`;
const BASE = "https://abc.supabase.co/functions/v1/qr-resolver/storage";

class FakeBucket implements ObjectBucket {
  readonly objects = new Map<string, Uint8Array>();
  fail: BucketError | null = null;
  async upload(key: string, body: Uint8Array, options: { upsert: boolean }) {
    if (this.fail) return { error: this.fail };
    if (!options.upsert && this.objects.has(key)) return { error: { message: "The resource already exists", statusCode: "409" } };
    this.objects.set(key, body);
    return { error: null };
  }
  async download(key: string) {
    if (this.fail) return { data: null, error: this.fail };
    const body = this.objects.get(key);
    return body ? { data: new Blob([body as BlobPart], { type: "image/svg+xml" }), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } };
  }
  async remove(keys: string[]) {
    for (const key of keys) this.objects.delete(key);
    return { error: null };
  }
}

class FakeCatalog implements AssetCatalog {
  readonly rows = new Map<string, CatalogEntry>();
  failRegister = false;
  async findByKey(key: string) {
    return this.rows.get(key) ?? null;
  }
  async register(entry: CatalogEntry) {
    if (this.failRegister) throw new Error("db caída");
    if (!this.rows.has(entry.storage_key)) this.rows.set(entry.storage_key, entry);
  }
}

function setup() {
  const bucket = new FakeBucket();
  const catalog = new FakeCatalog();
  const warnings: string[] = [];
  const storage = new SupabaseStorageProvider({ bucket, catalog, publicBase: BASE, createdBy: "user-1", warn: (m) => warnings.push(m) });
  return { bucket, catalog, storage, warnings };
}

const OPTIONS = { contentType: "image/svg+xml", ifNoneMatch: true, metadata: { "svg-sha256": "b".repeat(64), renderer: "qrsvg-1+qr@0.7.2" } } as const;

describe("SupabaseStorageProvider", () => {
  it("sube solo si no existe: la segunda vez devuelve «exists» sin tocar el archivo", async () => {
    const { storage, bucket } = setup();
    expect((await storage.upload(KEY, "<svg/>", OPTIONS)).status).toBe("created");
    bucket.objects.set(KEY, new TextEncoder().encode("<otro/>"));
    expect((await storage.upload(KEY, "<svg/>", OPTIONS)).status).toBe("exists");
    expect(new TextDecoder().decode(bucket.objects.get(KEY))).toBe("<otro/>");
  });

  it("registra cada archivo nuevo en el catálogo (hash UNIQUE → clave) con su huella, renderer y autor", async () => {
    const { storage, catalog } = setup();
    await storage.upload(KEY, "<svg/>", OPTIONS);
    expect(catalog.rows.get(KEY)).toEqual({ tipo: "generado", content_hash: HASH, storage_key: KEY, svg_sha256: "b".repeat(64), renderer: "qrsvg-1+qr@0.7.2", created_by: "user-1" });
    const snapshot = `qr/ext/v1/${"c".repeat(64)}.json`;
    await storage.upload(snapshot, "{}", { contentType: "application/json", ifNoneMatch: true });
    expect(catalog.rows.get(snapshot)).toMatchObject({ tipo: "externo", content_hash: "c".repeat(64) });
  });

  it("si el catálogo falla, el archivo igualmente queda subido y se avisa (no se pierde el trabajo)", async () => {
    const { storage, catalog, bucket, warnings } = setup();
    catalog.failRegister = true;
    expect((await storage.upload(KEY, "<svg/>", OPTIONS)).status).toBe("created");
    expect(bucket.objects.has(KEY)).toBe(true);
    expect(warnings).toEqual(["No se pudo registrar el QR en qr_activos"]);
  });

  it("head sale del catálogo; sin fila, mide el archivo almacenado", async () => {
    const { storage, bucket, catalog } = setup();
    expect(await storage.head(KEY)).toBeNull();
    await storage.upload(KEY, "<svg/>", OPTIONS);
    expect(await storage.head(KEY)).toEqual({ metadata: { "svg-sha256": "b".repeat(64), renderer: "qrsvg-1+qr@0.7.2" } });
    catalog.rows.clear();
    expect(await storage.head(KEY)).toEqual({ metadata: { "svg-sha256": sha256Hex(bucket.objects.get(KEY) as Uint8Array) } });
  });

  it("get devuelve null si no existe y lanza un StorageError claro si el almacenamiento falla", async () => {
    const { storage, bucket } = setup();
    expect(await storage.get(KEY)).toBeNull();
    bucket.fail = { message: "boom", statusCode: "500" };
    await expect(storage.get(KEY)).rejects.toMatchObject({ code: "unavailable", message: "No se pudo leer el archivo en el almacenamiento" });
    bucket.fail = { message: "new row violates row-level security policy", statusCode: "403" };
    await expect(storage.upload(KEY, "<svg/>", OPTIONS)).rejects.toMatchObject({ code: "forbidden" });
    bucket.fail = { message: "The object exceeded the maximum allowed size", statusCode: "413" };
    await expect(storage.upload(KEY, "<svg/>", OPTIONS)).rejects.toMatchObject({ code: "quota" });
  });

  it("rechaza claves inventadas antes de llamar al almacenamiento (../, claves ajenas)", async () => {
    const { storage, bucket } = setup();
    for (const key of ["../secreto.svg", "fuentes/x.woff2", "qr/v1/zz.svg", `s/v1/ab3de9xk.json`]) {
      await expect(storage.get(key), key).rejects.toBeInstanceOf(StorageError);
      await expect(storage.upload(key, "x", OPTIONS), key).rejects.toBeInstanceOf(StorageError);
    }
    expect(bucket.objects.size).toBe(0);
  });

  it("la URL pública se deriva de la clave y se invierte sin red; las ajenas no se reconocen", () => {
    const { storage } = setup();
    expect(storage.getPublicUrl(KEY)).toBe(`${BASE}/${KEY}`);
    expect(storage.keyFromPublicUrl(`${BASE}/${KEY}`)).toBe(KEY);
    expect(storage.keyFromPublicUrl(`https://evil.example.com/functions/v1/qr-resolver/storage/${KEY}`)).toBeNull();
    expect(storage.keyFromPublicUrl(`${BASE}/${KEY}?x=1`)).toBeNull();
  });

  it("delete ignora lo que ya no existe", async () => {
    const { storage } = setup();
    await expect(storage.delete(KEY)).resolves.toBeUndefined();
  });
});
