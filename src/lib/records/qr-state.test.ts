import { describe, expect, it } from "vitest";

import type { QrResolution } from "@/types";

import {
  existingRecord,
  existingSource,
  generatedRecord,
  generatedSource,
  HASH_B,
  LATER,
  MENU,
  NOW,
  pendingRecord,
} from "../../../tests/helpers/records";
import { acknowledgeQr, updateRecordData, draftOf } from "./factory";
import { canApplyResolution, deriveQrStatus, isExportable, qrBlocker, resolveQrDecision } from "./qr-state";

const OTHER_MENU = "https://menu.example.com/otro";

describe("resolveQrDecision — regla crítica (spec §9)", () => {
  it("sin Link del QR → generar", () => {
    expect(resolveQrDecision(pendingRecord())).toBe("generate");
  });

  it("con Link del QR → NUNCA generar (se verifica el existente)", () => {
    const record = pendingRecord({ qrUrl: "https://qr.cliente.com/m1.svg" });
    expect(record.qr.source).toBe("existing");
    expect(resolveQrDecision(record)).toBe("check-existing");
  });

  it("registro inconsistente (source none con qrUrl) tampoco genera", () => {
    expect(resolveQrDecision({ ...pendingRecord(), qrUrl: "https://qr.cliente.com/m1.svg" })).toBe("check-existing");
  });

  it("QR generado → se reutiliza (reabrir la app o regenerar el PDF no crea otro)", () => {
    expect(resolveQrDecision(generatedRecord())).toBe("reuse-generated");
  });

  it("QR generado con Link del menú editado → bloqueado (stale), nunca regenera solo", () => {
    expect(resolveQrDecision(generatedRecord({ menuUrl: OTHER_MENU }))).toBe("blocked-stale");
  });

  it("stale con ack ligado → reutilizar; el ack caduca si el Link vuelve a cambiar", () => {
    const stale = generatedRecord({ menuUrl: OTHER_MENU });
    const acked = acknowledgeQr(stale, "stale", LATER);
    expect(resolveQrDecision(acked)).toBe("reuse-generated");
    expect(isExportable(acked)).toBe(true);

    const editedAgain = updateRecordData(acked, { ...draftOf(acked), menuUrl: "https://menu.example.com/tercero" }, LATER);
    expect(editedAgain.qrAck).toBeUndefined();
    expect(resolveQrDecision(editedAgain)).toBe("blocked-stale");
  });

  it("existente sin verificar o con error → comprobar, nunca generar", () => {
    expect(resolveQrDecision(existingRecord({ qr: existingSource({ verification: "unchecked" }) }))).toBe("check-existing");
    expect(resolveQrDecision(existingRecord({ qrError: { code: "unreachable", message: "x" } }))).toBe("check-existing");
    expect(resolveQrDecision(existingRecord({ qr: existingSource({ snapshotKey: undefined }) }))).toBe("check-existing");
  });

  it("existente verificado que coincide → listo", () => {
    expect(resolveQrDecision(existingRecord())).toBe("none");
    expect(isExportable(existingRecord())).toBe(true);
  });

  it("existente que apunta a otra URL (mismatch derivado) → bloqueado salvo ack", () => {
    const mismatch = existingRecord({ qr: existingSource({ decodedPayload: OTHER_MENU }) });
    expect(resolveQrDecision(mismatch)).toBe("blocked-existing");
    expect(qrBlocker(mismatch)).toBe("existing-mismatch");
    expect(resolveQrDecision(acknowledgeQr(mismatch, "mismatch", LATER))).toBe("none");
  });

  it("existente ilegible → bloqueado salvo ack 'undecodable' ligado a assetSha256", () => {
    const unreadable = existingRecord({ qr: existingSource({ verification: "undecodable", decodedPayload: undefined }) });
    expect(qrBlocker(unreadable)).toBe("existing-undecodable");
    const acked = acknowledgeQr(unreadable, "undecodable", LATER);
    expect(resolveQrDecision(acked)).toBe("none");
    // Si el archivo cambia (otra huella), el ack deja de valer.
    expect(resolveQrDecision({ ...acked, qr: existingSource({ verification: "undecodable", assetSha256: "c".repeat(64) }) })).toBe(
      "blocked-existing",
    );
  });

  it("un ack de otro tipo no desbloquea", () => {
    const mismatch = existingRecord({ qr: existingSource({ decodedPayload: OTHER_MENU }) });
    expect(resolveQrDecision({ ...mismatch, qrAck: { kind: "stale", menuUrl: MENU, qrFingerprint: HASH_B, at: NOW } })).toBe(
      "blocked-existing",
    );
  });
});

describe("deriveQrStatus (§B.4)", () => {
  it("mapea cada situación al estado visible", () => {
    expect(deriveQrStatus(pendingRecord())).toBe("pending");
    expect(deriveQrStatus(pendingRecord(), true)).toBe("generating");
    expect(deriveQrStatus(generatedRecord())).toBe("generated");
    expect(deriveQrStatus(generatedRecord({ menuUrl: OTHER_MENU }))).toBe("stale");
    expect(deriveQrStatus(existingRecord())).toBe("existing");
    expect(deriveQrStatus(existingRecord(), true)).toBe("existing");
    expect(deriveQrStatus(existingRecord({ qrError: { code: "raster-only", message: "PNG" } }))).toBe("error");
  });
});

describe("isExportable", () => {
  it("bloquea pendientes, errores de validación y errores de QR", () => {
    expect(isExportable(pendingRecord())).toBe(false);
    expect(isExportable(generatedRecord())).toBe(true);
    expect(isExportable(generatedRecord({ validationErrors: [{ field: "mesa", code: "REQUIRED_EMPTY", message: "x", severity: "error" }] }))).toBe(false);
    expect(isExportable(generatedRecord({ validationErrors: [{ field: "menuUrl", code: "HTTP_URL", message: "x", severity: "warning" }] }))).toBe(true);
    expect(isExportable(existingRecord({ qrError: { code: "unreachable", message: "x" } }))).toBe(false);
  });
});

describe("canApplyResolution (guarda de aplicación)", () => {
  const generated: QrResolution = { recordId: "r1", outcome: "generated", qrUrl: "https://cdn.example.com/q.svg", qr: generatedSource() };

  it("aplica si el registro no cambió", () => {
    expect(canApplyResolution(pendingRecord(), { menuUrl: MENU }, generated)).toBe(true);
  });

  it("descarta si el usuario editó el Link del menú mientras se generaba (no produce stale falsos)", () => {
    expect(canApplyResolution(pendingRecord({ menuUrl: OTHER_MENU }), { menuUrl: MENU }, generated)).toBe(false);
  });

  it("descarta si el usuario tecleó un Link del QR entretanto (no se sobrescribe con uno generado)", () => {
    const typed = pendingRecord({ qrUrl: "https://qr.cliente.com/m1.svg" });
    expect(canApplyResolution(typed, { menuUrl: MENU }, generated)).toBe(false);
  });

  it("verificación de existente: solo si el Link del QR sigue siendo el mismo", () => {
    const record = existingRecord({ qr: existingSource({ verification: "unchecked" }) });
    const ok: QrResolution = { recordId: "r1", outcome: "existing-ok", qr: existingSource() };
    expect(canApplyResolution(record, { menuUrl: MENU, qrUrl: record.qrUrl }, ok)).toBe(true);
    expect(canApplyResolution(record, { menuUrl: MENU, qrUrl: "https://otro.com/q.svg" }, ok)).toBe(false);
  });

  it("un fallo no se aplica sobre un registro que ya tiene QR generado", () => {
    const failed: QrResolution = { recordId: "r1", outcome: "failed", error: { code: "storage-failed", message: "x" } };
    expect(canApplyResolution(pendingRecord(), { menuUrl: MENU }, failed)).toBe(true);
    expect(canApplyResolution(generatedRecord(), { menuUrl: MENU, qrUrl: generatedRecord().qrUrl }, failed)).toBe(false);
  });
});
