import { describe, expect, it } from "vitest";

import { acknowledgeQr } from "./factory";
import { qrBadge } from "./qr-badge";
import { existingRecord, existingSource, generatedRecord, LATER, pendingRecord } from "../../../tests/helpers/records";

describe("qrBadge — tabla de estados visibles (spec §30, §37)", () => {
  it("sin QR: «QR pendiente» y la acción de generar", () => {
    expect(qrBadge(pendingRecord())).toMatchObject({ label: "QR pendiente (vista previa)", tone: "default", blocking: true, actions: ["generate"] });
  });

  it("generando", () => {
    expect(qrBadge(pendingRecord(), true)).toMatchObject({ label: "Generando QR…", icon: "generating", actions: [] });
  });

  it("generado: «✓ QR generado», sin bloqueo", () => {
    expect(qrBadge(generatedRecord())).toMatchObject({ label: "✓ QR generado", tone: "success", blocking: false });
  });

  it("stale sin confirmar bloquea con [Regenerar] y [Mantener]; confirmado se muestra como mantenido", () => {
    const stale = generatedRecord({ menuUrl: "https://menu.example.com/otro" });
    expect(qrBadge(stale)).toMatchObject({ label: "⚠ QR desactualizado", blocking: true, actions: ["regenerate", "keep"] });
    expect(qrBadge(acknowledgeQr(stale, "stale", LATER))).toMatchObject({ label: "QR anterior mantenido", blocking: false });
  });

  it("existente: verificando, verificado, discrepante, ilegible y confirmado", () => {
    expect(qrBadge(existingRecord({ qr: existingSource({ verification: "unchecked" }) }))).toMatchObject({ label: "QR existente · verificando", blocking: true });
    expect(qrBadge(existingRecord())).toMatchObject({ label: "✓ QR existente", tone: "success", blocking: false });
    const mismatch = existingRecord({ qr: existingSource({ decodedPayload: "https://otra.example.com" }) });
    expect(qrBadge(mismatch)).toMatchObject({ label: "⚠ QR existente apunta a otra URL", blocking: true, actions: ["use-anyway", "replace"], tooltip: "El QR lee: https://otra.example.com" });
    expect(qrBadge(acknowledgeQr(mismatch, "mismatch", LATER))).toMatchObject({ label: "QR existente (confirmado por el usuario)", blocking: false });
    expect(qrBadge(existingRecord({ qr: existingSource({ verification: "undecodable", decodedPayload: undefined }) }))).toMatchObject({ label: "⚠ QR existente ilegible", actions: ["use-anyway", "verify"] });
  });

  it("errores: siempre visibles, con mensaje en español y acciones; nunca generan solos", () => {
    const failed = existingRecord({ qrError: { code: "raster-only", message: "x" } });
    expect(qrBadge(failed)).toMatchObject({ label: "✕ Error de QR: raster-only", tone: "error", blocking: true, actions: ["retry", "replace"] });
    expect(qrBadge(failed).tooltip).toMatch(/SVG/);
    expect(qrBadge({ ...pendingRecord(), qrError: { code: "storage-failed", message: "x" } }).actions).toEqual(["retry"]);
  });
});
