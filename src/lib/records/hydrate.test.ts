import { describe, expect, it } from "vitest";

import { acknowledgeQr } from "./factory";
import { hydrateRecords, stripAcks } from "./hydrate";
import { generatedRecord, LATER, NOW, pendingRecord } from "../../../tests/helpers/records";

describe("hydrateRecords", () => {
  it("un registro corrupto va a cuarentena sin afectar al resto", () => {
    const ok = pendingRecord({}, "ok");
    const invalidRules = { ...pendingRecord({}, "bad-rules"), menuUrl: "hola", validationErrors: [] };
    const result = hydrateRecords({ ok, "bad-rules": invalidRules, broken: { id: "broken", area: 42 } }, ["broken", "ok", "bad-rules"], LATER);

    expect(Object.keys(result.recordsById).sort()).toEqual(["bad-rules", "ok"]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.raw).toEqual({ id: "broken", area: 42 });
    expect(result.order).toEqual(["ok", "bad-rules"]);
    // Cumple la forma pero no las reglas: carga, visible y marcado.
    expect(result.recordsById["bad-rules"]?.validationErrors.map((i) => i.code)).toEqual(["INVALID_URL"]);
  });

  it("'generating' nunca se restaura (invariante 9)", () => {
    const record = { ...pendingRecord({}, "g"), qrStatus: "generating" as const };
    expect(hydrateRecords({ g: record }, ["g"], NOW).recordsById.g?.qrStatus).toBe("pending");
  });

  it("rechaza ids inconsistentes con la clave", () => {
    const result = hydrateRecords({ other: pendingRecord({}, "r1") }, [], NOW);
    expect(result.quarantine[0]?.reason).toContain("Id inconsistente");
  });

  it("reabrir el proyecto no regenera QR: el generado sigue generado", () => {
    const record = generatedRecord();
    const result = hydrateRecords({ [record.id]: record }, [record.id], LATER);
    expect(result.recordsById[record.id]).toEqual({ ...record, qrStatus: "generated", validationErrors: [] });
  });
});

describe("stripAcks (abrir .qrproj.json)", () => {
  it("borra todos los acks y lista las piezas afectadas", () => {
    const acked = acknowledgeQr(generatedRecord({ menuUrl: "https://menu.example.com/otro" }), "stale", NOW);
    const { recordsById, affected } = stripAcks({ [acked.id]: acked, p: pendingRecord({}, "p") });
    expect(affected).toEqual([acked.id]);
    expect(recordsById[acked.id]?.qrAck).toBeUndefined();
    expect(recordsById[acked.id]?.qrStatus).toBe("stale");
  });
});
