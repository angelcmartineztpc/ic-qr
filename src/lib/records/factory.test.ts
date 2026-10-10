import { describe, expect, it } from "vitest";

import { StoredRecordSchema } from "@/schemas/record";

import { draft, existingRecord, existingSource, generatedRecord, generatedSource, LATER, MENU, NOW, pendingRecord } from "../../../tests/helpers/records";
import { acknowledgeQr, applyQrResolution, createRecord, draftOf, duplicateRecord, regenerateQr, updateRecordData } from "./factory";

describe("createRecord", () => {
  it("sin Link del QR → pendiente; con Link del QR → existente sin verificar", () => {
    const pending = pendingRecord();
    expect(pending).toMatchObject({ qrStatus: "pending", qr: { source: "none" }, validationErrors: [] });
    expect(pending.qrUrl).toBeUndefined();

    const existing = createRecord(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }), { now: NOW, order: 3, origin: "excel", sourceRow: 18 });
    expect(existing).toMatchObject({ qrStatus: "existing", qr: { source: "existing", verification: "unchecked" }, order: 3 });
    expect(existing.metadata).toEqual({ origin: "excel", sourceRow: 18 });
  });

  it("el registro creado cumple el schema de persistencia", () => {
    expect(StoredRecordSchema.safeParse(pendingRecord()).success).toBe(true);
  });
});

describe("updateRecordData — transiciones del QR", () => {
  it("editar el Link del menú de un QR generado lo deja stale; nunca lo regenera", () => {
    const record = generatedRecord();
    const edited = updateRecordData(record, { ...draftOf(record), menuUrl: "https://menu.example.com/otro" }, LATER);
    expect(edited.qrStatus).toBe("stale");
    expect(edited.qr).toEqual(record.qr);
    expect(edited.qrUrl).toBe(record.qrUrl);
    expect(edited.updatedAt).toBe(LATER);
  });

  it("volver al Link original quita el stale", () => {
    const record = generatedRecord();
    const edited = updateRecordData(record, { ...draftOf(record), menuUrl: "https://menu.example.com/otro" }, LATER);
    const restored = updateRecordData(edited, { ...draftOf(edited), menuUrl: MENU }, LATER);
    expect(restored.qrStatus).toBe("generated");
  });

  it("escribir un Link del QR propio en un generado → existente sin verificar", () => {
    const record = generatedRecord();
    const edited = updateRecordData(record, { ...draftOf(record), qrUrl: "https://qr.cliente.com/propio.svg" }, LATER);
    expect(edited.qr).toEqual({ source: "existing", assetKind: "unknown", verification: "unchecked" });
    expect(edited.qrUrl).toBe("https://qr.cliente.com/propio.svg");
  });

  it("vaciar el Link del QR de un existente → pendiente (se generará)", () => {
    const record = existingRecord({ qrError: { code: "unreachable", message: "x" } });
    const { qrUrl: _omit, ...rest } = draftOf(record);
    const edited = updateRecordData(record, rest, LATER);
    expect(edited).toMatchObject({ qrStatus: "pending", qr: { source: "none" } });
    expect(edited.qrUrl).toBeUndefined();
    expect(edited.qrError).toBeUndefined();
  });

  it("editar el Link del menú de un existente no toca el QR (el mismatch se deriva)", () => {
    const record = existingRecord();
    const edited = updateRecordData(record, { ...draftOf(record), menuUrl: "https://menu.example.com/otro" }, LATER);
    expect(edited.qr).toEqual(record.qr);
    expect(edited.qrStatus).toBe("existing");
  });

  it("un fallo de generación se limpia al cambiar el Link del menú", () => {
    const failed = { ...pendingRecord(), qrError: { code: "storage-failed" as const, message: "x" } };
    const edited = updateRecordData(failed, draft({ menuUrl: "https://menu.example.com/otro" }), LATER);
    expect(edited.qrError).toBeUndefined();
    expect(edited.qrStatus).toBe("pending");
  });
});

describe("applyQrResolution", () => {
  it("generado → guarda qr y qrUrl derivada", () => {
    const record = applyQrResolution(
      pendingRecord(),
      { recordId: "r1", outcome: "generated", qrUrl: "https://cdn.example.com/qr/v1/x.svg", qr: generatedSource() },
      LATER,
    );
    expect(record).toMatchObject({ qrStatus: "generated", qrUrl: "https://cdn.example.com/qr/v1/x.svg" });
  });

  it("verificación de existente: conserva el ack solo si sigue ligado a la nueva huella", () => {
    const record = acknowledgeQr(existingRecord({ qr: existingSource({ decodedPayload: "https://otro.com" }) }), "mismatch", NOW);
    const sameAsset = applyQrResolution(record, { recordId: "r1", outcome: "existing-ok", qr: existingSource({ decodedPayload: "https://otro.com" }) }, LATER);
    expect(sameAsset.qrAck).toBeDefined();
    const changed = applyQrResolution(
      record,
      { recordId: "r1", outcome: "existing-ok", qr: existingSource({ decodedPayload: "https://otro.com", assetSha256: "c".repeat(64) }) },
      LATER,
    );
    expect(changed.qrAck).toBeUndefined();
  });

  it("fallo → qrError visible, sin generar", () => {
    const record = applyQrResolution(existingRecord(), { recordId: "r1", outcome: "failed", error: { code: "raster-only", message: "Es PNG" } }, LATER);
    expect(record.qrStatus).toBe("error");
    expect(record.qr.source).toBe("existing");
  });
});

describe("regenerateQr y duplicateRecord", () => {
  it("Regenerar (acción explícita) vuelve a pendiente; solo aplica a generados", () => {
    const stale = generatedRecord({ menuUrl: "https://menu.example.com/otro" });
    expect(regenerateQr(stale, LATER)).toMatchObject({ qrStatus: "pending", qr: { source: "none" } });
    const existing = existingRecord();
    expect(regenerateQr(existing, LATER)).toBe(existing);
  });

  it("Duplicar conserva el mismo QR (no crea otro archivo) y marca el origen", () => {
    const original = generatedRecord();
    const copy = duplicateRecord(original, { now: LATER, order: 1, id: "r2" });
    expect(copy).toMatchObject({ id: "r2", order: 1, qr: original.qr, qrUrl: original.qrUrl });
    expect(copy.metadata).toEqual({ origin: "duplicate", duplicateOf: original.id });
  });
});
