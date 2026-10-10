import { describe, expect, it, vi } from "vitest";

import { encodeMatrix } from "@/lib/qr/encode";
import { externalSnapshotKey } from "@/lib/qr/hash-input";
import { renderQrSvg } from "@/lib/qr/render-svg";
import type { ExportRecord } from "@/types";

import { MemoryStorage, PUBLIC_BASE } from "../../../tests/helpers/memory-storage";
import { bytes, ownQrSvg, strokeQrSvg } from "../../../tests/helpers/qr-svg";
import { sha256Hex, contentHashOf } from "./hash";
import { QrIdentityError, verifyQrIdentity } from "./identity";
import { MaterializeError, materializeQrGeometry } from "./materialize";
import { HourlyQuota } from "./quota";
import { resolveGenerate } from "./resolve";
import { verifyExistingQr } from "./verify-existing";

const MENU = "https://menu.example.com/tropical";

async function generatedExportRecord(storage = new MemoryStorage()): Promise<{ record: ExportRecord; storage: MemoryStorage }> {
  const { results } = await resolveGenerate([{ recordId: "r1", menuUrl: MENU, expectedRevision: 0 }], { storage, keyPrefix: "", quota: new HourlyQuota(100), now: () => new Date() });
  const result = results[0];
  if (result?.outcome !== "generated") throw new Error("no se generó");
  return {
    storage,
    record: { id: "r1", area: "Tropical", estacion: "", mesa: "M1", subgrupo: "", concepto: "", menuUrl: MENU, qrUrl: result.qrUrl, qr: result.qr },
  };
}

async function existingExportRecord(storage: MemoryStorage, svg: string): Promise<ExportRecord> {
  const verified = await verifyExistingQr("https://qr.cliente.com/m1.svg", {
    storage,
    keyPrefix: "",
    now: () => new Date(),
    fetchRemote: async (url) => ({ bytes: bytes(svg), contentType: "image/svg+xml", finalUrl: url }),
  });
  if (!verified.ok) throw new Error(verified.error.message);
  return { id: "r2", area: "Tropical", estacion: "", mesa: "M2", subgrupo: "", concepto: "", menuUrl: MENU, qrUrl: "https://qr.cliente.com/m1.svg", qr: verified.qr };
}

const ctx = (storage: MemoryStorage) => ({ storage, keyPrefix: "" });

describe("verifyQrIdentity (§S2.5)", () => {
  it("un QR generado íntegro pasa", async () => {
    const { record, storage } = await generatedExportRecord();
    expect(() => verifyQrIdentity(record, ctx(storage))).not.toThrow();
  });

  it("detecta una clave, un hash, un payload o un link manipulados (estado corrupto o .qrproj.json editado)", async () => {
    const { record, storage } = await generatedExportRecord();
    if (record.qr.source !== "generated") throw new Error("se esperaba generado");
    const other = "b".repeat(64);
    const tampered: Array<[string, ExportRecord]> = [
      ["storageKey", { ...record, qr: { ...record.qr, storageKey: `qr/v1/${other}.svg` } }],
      ["contentHash", { ...record, qr: { ...record.qr, contentHash: other } }],
      ["payload", { ...record, qr: { ...record.qr, payload: "https://otro.example.com/menu" } }],
      ["qrUrl a otro archivo", { ...record, qrUrl: `${PUBLIC_BASE}/qr/v1/${other}.svg` }],
      ["qrUrl a otro host", { ...record, qrUrl: `https://evil.example.com/qr/v1/${contentHashOf(MENU)}.svg` }],
      ["prefijo ajeno", { ...record, qr: { ...record.qr, storageKey: `staging/qr/v1/${contentHashOf(MENU)}.svg` } }],
    ];
    for (const [name, bad] of tampered) {
      expect(() => verifyQrIdentity(bad, ctx(storage)), name).toThrow(QrIdentityError);
    }
    try {
      verifyQrIdentity(tampered[0]![1], ctx(storage));
    } catch (error) {
      expect(error).toMatchObject({ code: "QR_IDENTITY_MISMATCH", recordId: "r1" });
    }
  });

  it("QR existente: la instantánea debe corresponder a su huella", async () => {
    const storage = new MemoryStorage();
    const record = await existingExportRecord(storage, ownQrSvg(MENU));
    expect(() => verifyQrIdentity(record, ctx(storage))).not.toThrow();
    const qr = record.qr;
    if (qr.source !== "existing") throw new Error("se esperaba existente");
    expect(() => verifyQrIdentity({ ...record, qr: { ...qr, assetSha256: "c".repeat(64) } }, ctx(storage))).toThrow(QrIdentityError);
    expect(() => verifyQrIdentity({ ...record, qr: { ...qr, snapshotKey: externalSnapshotKey("d".repeat(64)) } }, ctx(storage))).toThrow(QrIdentityError);
  });

  it("un registro sin QR no se puede exportar", async () => {
    const { record, storage } = await generatedExportRecord();
    expect(() => verifyQrIdentity({ ...record, qr: { source: "none" } }, ctx(storage))).toThrow(QrIdentityError);
  });
});

describe("materializeQrGeometry — la exportación NO crea QR, NO escribe y NO sale a la red", () => {
  it("generado: re-codifica en local y coincide con el SVG guardado; no toca el storage", async () => {
    const { record, storage } = await generatedExportRecord();
    const before = { ...storage.calls };
    const geometry = await materializeQrGeometry(record, { storage });
    expect(geometry).toMatchObject({ kind: "matrix", modules: 33 });
    expect(geometry.kind === "matrix" && geometry.matrix).toEqual(encodeMatrix(MENU));
    expect(storage.calls).toEqual(before); // 0 get, 0 upload
    expect(record.qr.source === "generated" && sha256Hex(renderQrSvg(encodeMatrix(MENU))) === record.qr.svgSha256).toBe(true);
  });

  it("si cambió el renderer, usa el ARCHIVO ALMACENADO (no regenera ni sube nada) y avisa", async () => {
    const { record, storage } = await generatedExportRecord();
    if (record.qr.source !== "generated") throw new Error("se esperaba generado");
    const warn = vi.fn();
    const geometry = await materializeQrGeometry({ ...record, qr: { ...record.qr, svgSha256: "0".repeat(64) } }, { storage, warn });
    expect(geometry.kind).toBe("external");
    expect(warn).toHaveBeenCalledOnce();
    expect(storage.calls.upload).toBe(1); // solo la subida original de la generación
  });

  it("si además el archivo ya no existe → error claro (nunca un QR inventado)", async () => {
    const { record } = await generatedExportRecord();
    if (record.qr.source !== "generated") throw new Error("se esperaba generado");
    await expect(materializeQrGeometry({ ...record, qr: { ...record.qr, svgSha256: "0".repeat(64) } }, { storage: new MemoryStorage() })).rejects.toBeInstanceOf(MaterializeError);
  });

  it("existente: lee la instantánea saneada (sin red) y conserva la geometría exacta", async () => {
    const storage = new MemoryStorage();
    const record = await existingExportRecord(storage, strokeQrSvg(encodeMatrix(MENU)));
    storage.calls.upload = 0;
    const geometry = await materializeQrGeometry(record, { storage });
    expect(geometry).toMatchObject({ kind: "external", strokeBased: true, viewBox: [0, 0, 41, 41] });
    expect(storage.calls.upload).toBe(0);
  });

  it("instantánea ausente, dañada, inválida o de otro archivo → MaterializeError", async () => {
    const storage = new MemoryStorage();
    const record = await existingExportRecord(storage, ownQrSvg(MENU));
    const key = record.qr.source === "existing" ? (record.qr.snapshotKey ?? "") : "";
    const good = storage.objects.get(key);
    if (!good) throw new Error("falta la instantánea");

    storage.objects.delete(key);
    await expect(materializeQrGeometry(record, { storage })).rejects.toThrow(/no está en el almacenamiento/);

    storage.objects.set(key, { ...good, body: bytes("{no es json") });
    await expect(materializeQrGeometry(record, { storage })).rejects.toThrow(/dañada/);

    storage.objects.set(key, { ...good, body: bytes(JSON.stringify({ v: 1, assetSha256: "a".repeat(64), geometry: { viewBox: [0, 0, 1, 1], nodes: [{ type: "script" }], strokeBased: false } })) });
    await expect(materializeQrGeometry(record, { storage })).rejects.toThrow(/no es válida/);

    const otherAsset = JSON.parse(new TextDecoder().decode(good.body)) as { assetSha256: string };
    storage.objects.set(key, { ...good, body: bytes(JSON.stringify({ ...otherAsset, assetSha256: "e".repeat(64) })) });
    await expect(materializeQrGeometry(record, { storage })).rejects.toThrow(/no corresponde/);
  });

  it("un registro sin QR resuelto no se materializa", async () => {
    const { record, storage } = await generatedExportRecord();
    await expect(materializeQrGeometry({ ...record, qr: { source: "none" } }, { storage })).rejects.toBeInstanceOf(MaterializeError);
  });
});
