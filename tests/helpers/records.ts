import { createRecord } from "@/lib/records/factory";
import type { GeneratedQrSource, ExistingQrSource, QRRecord, RecordDraft } from "@/types";

export const NOW = "2026-10-06T10:00:00.000Z";
export const LATER = "2026-10-06T11:00:00.000Z";
export const MENU = "https://menu.example.com/tropical";
export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);

export function draft(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return { area: "Tropical", estacion: "Bar", mesa: "M1", subgrupo: "", concepto: "", menuUrl: MENU, ...overrides };
}

export function pendingRecord(overrides: Partial<RecordDraft> = {}, id = "r1"): QRRecord {
  return createRecord(draft(overrides), { now: NOW, order: 0, origin: "manual", id });
}

export function generatedSource(payload = MENU): GeneratedQrSource {
  return {
    source: "generated",
    storageKey: `qr/v1/${HASH_A}.svg`,
    payload,
    contentHash: HASH_A,
    svgSha256: HASH_B,
    rendererVersion: "qrsvg-1+qr@0.7.2",
    generatedAt: NOW,
  };
}

export function generatedRecord(overrides: Partial<QRRecord> = {}): QRRecord {
  return {
    ...pendingRecord(),
    qrStatus: "generated",
    qr: generatedSource(),
    qrUrl: `https://cdn.example.com/qr/v1/${HASH_A}.svg`,
    ...overrides,
  };
}

export function existingSource(overrides: Partial<ExistingQrSource> = {}): ExistingQrSource {
  return {
    source: "existing",
    assetKind: "svg",
    verification: "decoded",
    assetSha256: HASH_B,
    snapshotKey: `qr/ext/v1/${HASH_B}.json`,
    decodedPayload: MENU,
    checkedAt: NOW,
    ...overrides,
  };
}

export function existingRecord(overrides: Partial<QRRecord> = {}): QRRecord {
  return {
    ...pendingRecord(),
    qrStatus: "existing",
    qr: existingSource(),
    qrUrl: "https://qr.cliente.com/tropical/m1.svg",
    ...overrides,
  };
}
