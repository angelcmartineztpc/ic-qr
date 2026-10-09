import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFakeR2Bucket } from "../../../tests/helpers/fake-r2-bucket";
import { startFakeS3, type FakeS3 } from "../../../tests/helpers/fake-s3-server";
import type { StorageProvider } from "@/types";

import { isValidKey, keyFromPublicUrl, publicUrlFor, StorageError } from "./keys";
import { LocalStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";
import { S3StorageProvider } from "./s3";

const HASH = "a".repeat(64);
const KEY = `qr/v1/${HASH}.svg`;
const SNAPSHOT = `qr/ext/v1/${"b".repeat(64)}.json`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const OPTS = { contentType: "image/svg+xml", ifNoneMatch: true, metadata: { "svg-sha256": "c".repeat(64), renderer: "qrsvg-1" } } as const;

describe("claves", () => {
  it("acepta las claves de QR y de instantáneas, con prefijo opcional de un segmento", () => {
    expect(isValidKey(KEY)).toBe(true);
    expect(isValidKey(`prod/${KEY}`)).toBe(true);
    expect(isValidKey(SNAPSHOT)).toBe(true);
  });

  it.each([
    "../etc/passwd",
    `qr/v1/../${"a".repeat(64)}.svg`,
    `qr/v1/${"A".repeat(64)}.svg`,
    `qr/v1/${"a".repeat(63)}.svg`,
    `qr/v1/${HASH}.svg/`,
    `qr/v1/${HASH}.png`,
    `/qr/v1/${HASH}.svg`,
    `a/b/qr/v1/${HASH}.svg`,
    `qr/ext/v1/${HASH}.svg`,
    "",
  ])("rechaza %s", (key) => expect(isValidKey(key)).toBe(false));

  it("keyFromPublicUrl es la inversa de publicUrlFor y no sale a la red", () => {
    const base = "https://cdn.example.com/media";
    expect(publicUrlFor(KEY, base)).toBe(`https://cdn.example.com/media/${KEY}`);
    expect(keyFromPublicUrl(`https://cdn.example.com/media/${KEY}`, base)).toBe(KEY);
    expect(keyFromPublicUrl(`https://cdn.example.com/media/qr%2Fv1%2F${HASH}.svg`, base)).toBe(KEY);
    expect(keyFromPublicUrl(`https://otro.com/media/${KEY}`, base)).toBeNull();
    expect(keyFromPublicUrl(`https://cdn.example.com/otra/${KEY}`, base)).toBeNull();
    expect(keyFromPublicUrl(`https://cdn.example.com/media/${KEY}?x=1`, base)).toBeNull();
    expect(keyFromPublicUrl(`https://cdn.example.com/media/../${KEY}`, base)).toBeNull();
    expect(keyFromPublicUrl("no es una url", base)).toBeNull();
    expect(() => publicUrlFor("../x", base)).toThrow(StorageError);
  });
});

/** Contrato común: lo que debe cumplir CUALQUIER proveedor. */
function contract(name: string, make: () => Promise<{ storage: StorageProvider; cleanup?: () => Promise<void> }>) {
  describe(`contrato de StorageProvider: ${name}`, () => {
    let storage: StorageProvider;
    let cleanup: (() => Promise<void>) | undefined;
    beforeAll(async () => ({ storage, cleanup } = await make()));
    afterAll(async () => cleanup?.());

    it("upload crea; el segundo upload «solo si no existe» devuelve exists y NO sobrescribe", async () => {
      const first = await storage.upload(KEY, SVG, OPTS);
      expect(first.status).toBe("created");
      const second = await storage.upload(KEY, "<svg>otro</svg>", OPTS);
      expect(second.status).toBe("exists");
      expect(new TextDecoder().decode((await storage.get(KEY))?.body)).toBe(SVG);
    });

    it("get / head / exists devuelven contenido, tipo y metadatos", async () => {
      const got = await storage.get(KEY);
      expect(got?.contentType).toBe("image/svg+xml");
      expect((await storage.head(KEY))?.metadata["svg-sha256"]).toBe("c".repeat(64));
      expect((await storage.head(KEY))?.metadata["renderer"]).toBe("qrsvg-1");
      expect(await storage.exists(KEY)).toBe(true);
    });

    it("una clave inexistente da null / false", async () => {
      const missing = `qr/v1/${"d".repeat(64)}.svg`;
      expect(await storage.get(missing)).toBeNull();
      expect(await storage.head(missing)).toBeNull();
      expect(await storage.exists(missing)).toBe(false);
    });

    it("20 subidas concurrentes de la misma clave dan 1 created y 19 exists", async () => {
      const key = `qr/v1/${"e".repeat(64)}.svg`;
      const results = await Promise.all(Array.from({ length: 20 }, () => storage.upload(key, SVG, OPTS)));
      expect(results.filter((r) => r.status === "created")).toHaveLength(1);
      expect(results.filter((r) => r.status === "exists")).toHaveLength(19);
    });

    it("JSON de instantáneas", async () => {
      await storage.upload(SNAPSHOT, '{"v":1}', { contentType: "application/json", ifNoneMatch: true });
      expect((await storage.get(SNAPSHOT))?.contentType).toBe("application/json");
    });

    it("rechaza claves inválidas antes de tocar el storage", async () => {
      await expect(storage.upload("../fuera.svg", SVG, OPTS)).rejects.toMatchObject({ code: "invalid-key" });
      await expect(storage.get("qr/../../x")).rejects.toMatchObject({ code: "invalid-key" });
    });

    it("delete", async () => {
      const key = `qr/v1/${"f".repeat(64)}.svg`;
      await storage.upload(key, SVG, OPTS);
      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
    });

    it("getPublicUrl ↔ keyFromPublicUrl", () => {
      expect(storage.keyFromPublicUrl(storage.getPublicUrl(KEY))).toBe(KEY);
    });
  });
}

let dir: string;
contract("disco local", async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-storage-"));
  return { storage: new LocalStorageProvider(dir, "http://localhost:3000/api/storage"), cleanup: () => rm(dir, { recursive: true, force: true }) };
});

let s3: FakeS3;
contract("S3 (SDK real contra servidor local)", async () => {
  s3 = await startFakeS3({ bucket: "qr-bucket" });
  const storage = new S3StorageProvider({
    bucket: "qr-bucket",
    region: "auto",
    endpoint: s3.endpoint,
    accessKey: "test",
    secretKey: "test",
    forcePathStyle: true,
    conditionalPut: true,
    publicBase: "https://cdn.example.com",
  });
  return { storage, cleanup: () => s3.close() };
});

const r2Bucket = createFakeR2Bucket();
contract("R2 (binding simulado)", async () => ({ storage: new R2StorageProvider({ bucket: async () => r2Bucket, publicBase: "https://qr.example.com/api/storage" }) }));

describe("R2 — comportamiento específico", () => {
  it("usa la condición nativa «solo si no existe» y guarda los metadatos personalizados", () => {
    const put = r2Bucket.puts.find((p) => p.key === KEY);
    expect(put?.onlyIf).toEqual({ etagDoesNotMatch: "*" });
    expect(r2Bucket.objects.get(KEY)?.customMetadata["svg-sha256"]).toBe("c".repeat(64));
  });

  it("si falta el binding avisa con un error de almacenamiento, no con un fallo genérico", async () => {
    const storage = new R2StorageProvider({ bucket: async () => Promise.reject(new StorageError("unavailable", "Falta el binding R2")), publicBase: "https://qr.example.com/api/storage" });
    await expect(storage.upload(KEY, SVG, OPTS)).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("disco local — detalles", () => {
  let own: string;
  let local: LocalStorageProvider;
  beforeAll(async () => {
    own = await mkdtemp(join(tmpdir(), "qrpg-storage-detail-"));
    local = new LocalStorageProvider(own, "http://localhost:3000/api/storage");
  });
  afterAll(() => rm(own, { recursive: true, force: true }));

  it("no deja archivos temporales y los metadatos existen siempre que existe el objeto", async () => {
    await Promise.all(Array.from({ length: 10 }, () => local.upload(KEY, SVG, OPTS)));
    const files = await readdir(join(own, "qr", "v1"));
    expect(files.filter((f) => f.startsWith(".tmp-"))).toEqual([]);
    expect(files.sort()).toEqual([`${HASH}.svg`, `${HASH}.svg.meta.json`]);
  });

  it("un archivo ajeno sin metadatos sigue siendo legible (head sin metadatos)", async () => {
    const key = `qr/v1/${"9".repeat(64)}.svg`;
    await writeFile(join(own, key), SVG);
    expect(await local.head(key)).toEqual({ metadata: {} });
    expect((await local.get(key))?.contentType).toBe("image/svg+xml");
  });
});

describe("S3 — comportamiento específico", () => {
  it("envía If-None-Match: * y guarda los metadatos como x-amz-meta-*", async () => {
    const put = s3.requests.find((r) => r.method === "PUT" && r.key === KEY);
    expect(put?.ifNoneMatch).toBe("*");
    expect(s3.objects.get(KEY)?.metadata["svg-sha256"]).toBe("c".repeat(64));
  });

  it("sin PUT condicional (Supabase hace upsert siempre): HEAD primero y nunca sobrescribe", async () => {
    const supa = await startFakeS3({ bucket: "qr-bucket", honorIfNoneMatch: false });
    try {
      const storage = new S3StorageProvider({ bucket: "qr-bucket", region: "us-east-1", endpoint: supa.endpoint, accessKey: "t", secretKey: "t", forcePathStyle: true, conditionalPut: false, publicBase: "https://cdn.example.com" });
      expect((await storage.upload(KEY, SVG, OPTS)).status).toBe("created");
      expect((await storage.upload(KEY, "<svg>distinto</svg>", OPTS)).status).toBe("exists");
      expect(supa.requests.filter((r) => r.method === "PUT")).toHaveLength(1);
      expect(supa.requests.every((r) => r.ifNoneMatch === undefined)).toBe(true);
      expect(new TextDecoder().decode(supa.objects.get(KEY)?.body)).toBe(SVG);
    } finally {
      await supa.close();
    }
  });

  it("un bucket inexistente se reporta como error de almacenamiento, no como «no existe»", async () => {
    const storage = new S3StorageProvider({ bucket: "otro-bucket", region: "auto", endpoint: s3.endpoint, accessKey: "t", secretKey: "t", forcePathStyle: true, conditionalPut: true, publicBase: "https://cdn.example.com" });
    await expect(storage.upload(KEY, SVG, OPTS)).rejects.toBeInstanceOf(StorageError);
  });
});
