import { describe, expect, it, vi } from "vitest";

import { encodeMatrix } from "@/services/qr-produccion/qr/encode";
import { ExternalSnapshotSchema } from "@/services/qr-produccion/schemas/qr-geometry";

import { MemoryStorage } from "../test-helpers/memory-storage";
import { bytes, ownQrSvg, rectQrSvg, strokeQrSvg } from "../test-helpers/qr-svg";
import { SafeFetchError } from "../net/safe-fetch";
import { sha256Hex } from "./hash";
import { rasterizeGeometry } from "./rasterize";
import { classifyAsset, verifyExistingQr, type VerifyDeps } from "./verify-existing";

const MENU = "https://menu.example.com/tropical";
// Firmas mínimas de imagen: classifyAsset decide por los bytes, no hace falta una imagen real (sin `sharp`).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const REMOTE = "https://qr.cliente.com/tropical/m1.svg";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function setup(remote: Uint8Array | SafeFetchError | null = null, prefix = "") {
  const storage = new MemoryStorage();
  const fetchRemote = vi.fn(async (url: string) => {
    if (remote instanceof SafeFetchError || remote === null) throw remote ?? new SafeFetchError("unreachable", "sin red");
    return { bytes: remote, contentType: "image/svg+xml", finalUrl: url };
  });
  const deps: VerifyDeps = { storage, fetchRemote, keyPrefix: prefix, now: () => NOW };
  return { storage, fetchRemote, deps };
}

describe("classifyAsset: el tipo se decide por los bytes", () => {
  it("SVG, imágenes, PDF, HTML y otros", async () => {
    const [png, jpeg, webp] = [PNG, JPEG, WEBP];
    expect([classifyAsset(png), classifyAsset(jpeg), classifyAsset(webp)]).toEqual(["raster", "raster", "raster"]);
    expect(classifyAsset(bytes(ownQrSvg(MENU)))).toBe("svg");
    expect(classifyAsset(bytes(`﻿  \n${ownQrSvg(MENU)}`))).toBe("svg");
    expect(classifyAsset(bytes(`<?xml version="1.0"?>${ownQrSvg(MENU)}`))).toBe("svg");
    expect(classifyAsset(bytes("%PDF-1.7 ..."))).toBe("pdf");
    expect(classifyAsset(bytes("<!DOCTYPE html><html></html>"))).toBe("html");
    expect(classifyAsset(bytes("hola"))).toBe("unknown");
    // Una imagen con extensión .svg sigue siendo una imagen.
    expect(classifyAsset(png)).toBe("raster");
  });
});

describe("verifyExistingQr — regla crítica: nunca genera", () => {
  it("un SVG propio en nuestro storage: se lee SIN red, decodifica y guarda la instantánea", async () => {
    const { storage, fetchRemote, deps } = setup();
    const key = `qr/v1/${"a".repeat(64)}.svg`;
    await storage.upload(key, ownQrSvg(MENU), { contentType: "image/svg+xml", ifNoneMatch: true });
    storage.calls.upload = 0;

    const result = await verifyExistingQr(storage.getPublicUrl(key), deps);
    if (!result.ok) throw new Error(result.error.message);
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result.qr).toMatchObject({ source: "existing", assetKind: "svg", verification: "decoded", decodedPayload: MENU, checkedAt: NOW.toISOString() });
    expect(result.qr.assetSha256).toBe(sha256Hex(bytes(ownQrSvg(MENU))));
    expect(result.qr.snapshotKey).toBe(`qr/ext/v1/${result.qr.assetSha256}.json`);
  });

  it("solo se sube la instantánea JSON: ningún QR (qr/v1/*.svg) se crea", async () => {
    const { storage, deps } = setup(bytes(strokeQrSvg(encodeMatrix(MENU))));
    await verifyExistingQr(REMOTE, deps);
    expect(storage.calls.upload).toBe(1);
    expect([...storage.objects.keys()].every((k) => k.startsWith("qr/ext/v1/") && k.endsWith(".json"))).toBe(true);
  });

  it("la instantánea cumple el schema y contiene la geometría saneada, sin el SVG original", async () => {
    const original = strokeQrSvg(encodeMatrix(MENU));
    const { storage, deps } = setup(bytes(original));
    const result = await verifyExistingQr(REMOTE, deps);
    if (!result.ok) throw new Error("falló");
    const snapshot = ExternalSnapshotSchema.parse(JSON.parse(new TextDecoder().decode(storage.objects.get(result.qr.snapshotKey ?? "")?.body)));
    expect(snapshot.assetSha256).toBe(result.qr.assetSha256);
    expect(snapshot.geometry.strokeBased).toBe(true);
    expect(result.qr.strokeBased).toBe(true);
  });

  it.each([
    ["nuestro estilo", ownQrSvg(MENU)],
    ["por trazos", strokeQrSvg(encodeMatrix(MENU))],
    ["un rect por módulo", rectQrSvg(encodeMatrix(MENU))],
  ])("decodifica QR externos (%s)", async (_name, svg) => {
    const { deps } = setup(bytes(svg));
    const result = await verifyExistingQr(REMOTE, deps);
    expect(result).toMatchObject({ ok: true, qr: { verification: "decoded", decodedPayload: MENU } });
  });

  it("un QR que apunta a OTRA URL se decodifica tal cual (el desajuste se deriva después, no se oculta)", async () => {
    const other = "https://otra.example.com/menu";
    const { deps } = setup(bytes(ownQrSvg(other)));
    const result = await verifyExistingQr(REMOTE, deps);
    expect(result).toMatchObject({ ok: true, qr: { verification: "decoded", decodedPayload: other } });
  });

  it("un SVG válido sin QR legible → undecodable (no es un error: el usuario decide)", async () => {
    const { deps } = setup(bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><circle/></svg>'.replace("<circle/>", '<path d="M2 2h3v3H2z"/>')));
    const result = await verifyExistingQr(REMOTE, deps);
    expect(result).toMatchObject({ ok: true, qr: { verification: "undecodable" } });
    expect(result.ok && result.qr.decodedPayload).toBeUndefined();
  });

  it("verificar dos veces el mismo recurso da la misma instantánea (idempotente)", async () => {
    const { storage, deps } = setup(bytes(ownQrSvg(MENU)));
    const first = await verifyExistingQr(REMOTE, deps);
    const second = await verifyExistingQr(REMOTE, deps);
    expect(first.ok && second.ok && first.qr.snapshotKey === second.qr.snapshotKey).toBe(true);
    expect(storage.objects.size).toBe(1);
  });

  it("respeta el prefijo de claves del entorno", async () => {
    const { deps } = setup(bytes(ownQrSvg(MENU)), "prod/");
    const result = await verifyExistingQr(REMOTE, deps);
    expect(result.ok && result.qr.snapshotKey).toMatch(/^prod\/qr\/ext\/v1\/[0-9a-f]{64}\.json$/);
  });
});

describe("verifyExistingQr — fallos: siempre un error visible, nunca generar", () => {
  const code = async (remote: Uint8Array | SafeFetchError) => {
    const { storage, deps } = setup(remote);
    const result = await verifyExistingQr(REMOTE, deps);
    expect(storage.calls.upload, "no debe subir nada al fallar").toBe(0);
    return result.ok ? "ok" : result.error.code;
  };

  it("PNG, JPG y WebP → raster-only (con la explicación y las acciones)", async () => {
    for (const image of [PNG, JPEG, WEBP]) expect(await code(image)).toBe("raster-only");
    const { deps } = setup(PNG);
    const result = await verifyExistingQr(REMOTE, deps);
    expect(!result.ok && result.error.message).toMatch(/SVG/);
  });

  it("una página web → not-an-image, preguntando si es un enlace de destino (§1.2-1)", async () => {
    const { deps } = setup(bytes("<!DOCTYPE html><html><body>Menú</body></html>"));
    const result = await verifyExistingQr(REMOTE, deps);
    expect(!result.ok && result.error).toMatchObject({ code: "not-an-image" });
    expect(!result.ok && result.error.message).toMatch(/enlace de destino/);
  });

  it("PDF → unsupported-type; texto cualquiera → not-an-image; SVG hostil → invalid-svg", async () => {
    expect(await code(bytes("%PDF-1.7"))).toBe("unsupported-type");
    expect(await code(bytes("hola"))).toBe("not-an-image");
    expect(await code(bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>'))).toBe("invalid-svg");
  });

  it.each([
    ["unsafe-url", "unsafe-url"],
    ["host-not-allowed", "host-not-allowed"],
    ["timeout", "timeout"],
    ["unreachable", "unreachable"],
    ["too-large", "too-large"],
  ] as const)("error de descarga %s → %s", async (fetchCode, expected) => {
    expect(await code(new SafeFetchError(fetchCode, "x"))).toBe(expected);
  });

  it("un archivo de nuestro storage que ya no existe → unreachable (no se genera uno nuevo)", async () => {
    const { storage, deps } = setup();
    const result = await verifyExistingQr(storage.getPublicUrl(`qr/v1/${"d".repeat(64)}.svg`), deps);
    expect(!result.ok && result.error.code).toBe("unreachable");
    expect(storage.calls.upload).toBe(0);
  });

  it("si el storage falla al guardar la instantánea → storage-failed", async () => {
    const { storage, deps } = setup(bytes(ownQrSvg(MENU)));
    storage.failNext = new (await import("../storage/keys")).StorageError("unavailable", "caído");
    const result = await verifyExistingQr(REMOTE, deps);
    expect(!result.ok && result.error.code).toBe("storage-failed");
  });
});

describe("rasterizador propio (sustituye a sharp)", () => {
  it("dibuja la geometría de un QR propio con módulos nítidos en blanco y negro", async () => {
    const { storage, deps } = setup(bytes(ownQrSvg(MENU)));
    const result = await verifyExistingQr(REMOTE, deps);
    if (!result.ok) throw new Error(result.error.message);
    const snapshot = ExternalSnapshotSchema.parse(JSON.parse(new TextDecoder().decode(storage.objects.get(result.qr.snapshotKey ?? "")?.body)));
    const raster = rasterizeGeometry(snapshot.geometry, { sizePx: 256 });
    expect(raster).toMatchObject({ width: 256, height: 256 });
    const values = new Set<number>();
    for (let i = 0; i < raster.data.length; i += 4) values.add(raster.data[i] as number);
    expect([...values].sort()).toEqual([0, 255]);
    expect(raster.data[3]).toBe(255); // opaco
    expect(raster.data[0]).toBe(255); // la esquina es zona de silencio
  });

  it("un SVG con un path ilegible no rompe la verificación: undecodable", async () => {
    const { deps } = setup(bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L4 4 5"/></svg>'));
    expect(await verifyExistingQr(REMOTE, deps)).toMatchObject({ ok: true, qr: { verification: "undecodable" } });
  });
});
