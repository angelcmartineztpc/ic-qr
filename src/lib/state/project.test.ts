import { describe, expect, it } from "vitest";

import { StoredRecordSchema } from "@/schemas/record";
import { getTemplate } from "@/templates";
import type { QrResolution } from "@/types";

import { draft, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { isPermutation } from "@/lib/records/order";
import { importRecords, acknowledge, addRecord, applyResolutions, changeTemplate, clearQrError, clearQuarantine, createEmptyProject, deleteRecords, duplicateRecordIn, isDirty, markQrFailure, markSaved, moveRecord, orderedRecords, regenerate, restoreRecords, setProjectName, sortRecords, updateRecord } from "./project";

const empty = () => createEmptyProject(NOW, { id: "p1" });
const withThree = () => {
  let s = empty();
  for (const mesa of ["M1", "M2", "M3"]) s = addRecord(s, draft({ mesa, menuUrl: `${MENU}?m=${mesa}` }), NOW, { id: `r-${mesa}` }).state;
  return s;
};
const generated = (recordId: string, payload = MENU): QrResolution => ({ recordId, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(payload) });

describe("proyecto vacío", () => {
  it("usa la plantilla por defecto, A4, y está limpio", () => {
    const p = empty();
    expect(p).toMatchObject({ schemaVersion: 2, templateId: "tropical-table", order: [], revision: 0, savedRevision: 0, name: "" });
    expect(p.layout.base).toEqual(getTemplate("tropical-table")?.defaultLayout);
    expect(p.exportOptions.pdf).toMatchObject({ mode: "sheet", pageSize: { kind: "A4" }, gapMm: 5 });
    expect(isDirty(p)).toBe(false);
  });

  it("dos proyectos no comparten estado mutable", () => {
    const a = empty();
    const b = empty();
    expect(a.exportOptions.pdf.margins).not.toBe(b.exportOptions.pdf.margins);
    expect(a.duplicateKey.fields).not.toBe(b.duplicateKey.fields);
  });

  it("rechaza una plantilla desconocida", () => {
    expect(() => createEmptyProject(NOW, { templateId: "no-existe" })).toThrow();
  });
});

describe("alta, edición y borrado (AC1–AC4)", () => {
  it("agregar crea una pieza pendiente, la pone al final y marca cambios sin guardar", () => {
    const { state, record } = addRecord(empty(), draft(), NOW);
    expect(state.order).toEqual([record.id]);
    expect(record).toMatchObject({ qrStatus: "pending", qr: { source: "none" }, order: 0 });
    expect(StoredRecordSchema.safeParse(record).success).toBe(true);
    expect(isDirty(state)).toBe(true);
    expect(markSaved(state, LATER)).toMatchObject({ revision: 1, savedRevision: 1 });
    expect(isDirty(markSaved(state, LATER))).toBe(false);
  });

  it("agregar varias mantiene el orden y cada una conserva sus datos (AC2)", () => {
    const s = withThree();
    expect(orderedRecords(s).map((r) => r.mesa)).toEqual(["M1", "M2", "M3"]);
    expect(s.revision).toBe(3);
  });

  it("insertar después de una pieza", () => {
    const s = withThree();
    const { state } = addRecord(s, draft({ mesa: "M9" }), NOW, { afterId: "r-M1", id: "x" });
    expect(state.order).toEqual(["r-M1", "x", "r-M2", "r-M3"]);
  });

  it("editar actualiza los datos y valida de nuevo; una pieza inexistente no cambia nada", () => {
    const s = withThree();
    const edited = updateRecord(s, "r-M1", draft({ mesa: "", menuUrl: MENU }), LATER);
    expect(edited.recordsById["r-M1"]?.validationErrors.map((e) => e.code)).toContain("REQUIRED_EMPTY");
    expect(edited.revision).toBe(s.revision + 1);
    expect(updateRecord(s, "nope", draft(), LATER)).toBe(s);
  });

  it("eliminar quita la pieza del orden, de los datos y de las posiciones personalizadas (AC3)", () => {
    let s = withThree();
    s = { ...s, layout: { ...s.layout, overrides: { "r-M2": { qr: { x: 1, y: 1, width: 10, height: 10 } } } } };
    const { state, removed } = deleteRecords(s, ["r-M2"]);
    expect(state.order).toEqual(["r-M1", "r-M3"]);
    expect(state.recordsById["r-M2"]).toBeUndefined();
    expect(state.layout.overrides).toEqual({});
    expect(removed.records.map((r) => r.id)).toEqual(["r-M2"]);
  });

  it("deshacer el borrado restaura cada pieza en su posición, también en lotes", () => {
    const s = withThree();
    const { state, removed } = deleteRecords(s, ["r-M3", "r-M1"]);
    expect(state.order).toEqual(["r-M2"]);
    const restored = restoreRecords(state, removed);
    expect(restored.order).toEqual(["r-M1", "r-M2", "r-M3"]);
    expect(restored.recordsById["r-M1"]).toEqual(s.recordsById["r-M1"]);
    expect(isPermutation(restored.order, Object.keys(restored.recordsById))).toBe(true);
  });

  it("borrar ids inexistentes no cambia el estado", () => {
    const s = withThree();
    expect(deleteRecords(s, ["nope"]).state).toBe(s);
  });

  it("duplicar crea una copia justo después, con el mismo QR y marcada como duplicado", () => {
    let s = withThree();
    s = applyResolutions(s, [generated("r-M1")], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER).state;
    const result = duplicateRecordIn(s, "r-M1", LATER);
    expect(result?.state.order.slice(0, 2)).toEqual(["r-M1", result?.record.id]);
    expect(result?.record.metadata).toEqual({ origin: "duplicate", duplicateOf: "r-M1" });
    expect(duplicateRecordIn(s, "nope", LATER)).toBeNull();
  });

  it("reordenar y ordenar son una sola mutación y siempre dejan una permutación (AC23)", () => {
    const s = withThree();
    const moved = moveRecord(s, "r-M3", 0);
    expect(moved.order).toEqual(["r-M3", "r-M1", "r-M2"]);
    expect(moved.revision).toBe(s.revision + 1);
    const sorted = sortRecords(moved, "mesa");
    expect(sorted.order).toEqual(["r-M1", "r-M2", "r-M3"]);
    expect(isPermutation(sorted.order, Object.keys(sorted.recordsById))).toBe(true);
  });
});

describe("resultados del QR y guarda de aplicación", () => {
  it("se aplica si la pieza no cambió", () => {
    const s = withThree();
    const out = applyResolutions(s, [generated("r-M1", `${MENU}?m=M1`)], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER);
    expect(out.applied).toEqual(["r-M1"]);
    expect(out.state.recordsById["r-M1"]).toMatchObject({ qrStatus: "generated", qr: { source: "generated" } });
  });

  it("se descarta si el usuario editó el Link del menú mientras se generaba (no hay 'stale' falsos)", () => {
    const s = withThree();
    const edited = updateRecord(s, "r-M1", draft({ mesa: "M1", menuUrl: "https://menu.example.com/otro" }), LATER);
    const out = applyResolutions(edited, [generated("r-M1", `${MENU}?m=M1`)], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER);
    expect(out.discarded).toEqual(["r-M1"]);
    expect(out.state).toBe(edited);
    expect(out.state.recordsById["r-M1"]?.qr.source).toBe("none");
  });

  it("se descarta si el usuario tecleó un Link del QR mientras tanto (no se sobrescribe)", () => {
    const s = withThree();
    const edited = updateRecord(s, "r-M1", draft({ mesa: "M1", menuUrl: `${MENU}?m=M1`, qrUrl: "https://qr.cliente.com/m1.svg" }), LATER);
    const out = applyResolutions(edited, [generated("r-M1", `${MENU}?m=M1`)], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER);
    expect(out.discarded).toEqual(["r-M1"]);
    expect(out.state.recordsById["r-M1"]?.qr.source).toBe("existing");
  });

  it("se descarta si la pieza se eliminó", () => {
    const { state } = deleteRecords(withThree(), ["r-M1"]);
    expect(applyResolutions(state, [generated("r-M1")], new Map([["r-M1", { menuUrl: MENU }]]), LATER).discarded).toEqual(["r-M1"]);
  });

  it("un fallo de red deja el error visible en cada pieza (nada silencioso) y se puede reintentar", () => {
    const s = withThree();
    const failed = markQrFailure(s, ["r-M1", "r-M2"], { code: "unreachable", message: "Sin conexión" }, LATER);
    expect(failed.recordsById["r-M1"]).toMatchObject({ qrStatus: "error", qrError: { code: "unreachable" } });
    const retry = clearQrError(failed, "r-M1", LATER);
    expect(retry.recordsById["r-M1"]).toMatchObject({ qrStatus: "pending" });
    expect(retry.recordsById["r-M1"]?.qrError).toBeUndefined();
    expect(clearQrError(s, "r-M1", LATER)).toBe(s);
  });

  it("no marca como fallo un QR ya generado", () => {
    let s = withThree();
    s = applyResolutions(s, [generated("r-M1", `${MENU}?m=M1`)], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER).state;
    expect(markQrFailure(s, ["r-M1"], { code: "unreachable", message: "x" }, LATER)).toBe(s);
  });

  it("regenerar y mantener (ack) actúan sobre la pieza stale", () => {
    let s = withThree();
    s = applyResolutions(s, [generated("r-M1", `${MENU}?m=M1`)], new Map([["r-M1", { menuUrl: `${MENU}?m=M1` }]]), LATER).state;
    s = updateRecord(s, "r-M1", draft({ mesa: "M1", menuUrl: "https://menu.example.com/nuevo" }), LATER);
    expect(s.recordsById["r-M1"]?.qrStatus).toBe("stale");
    expect(acknowledge(s, "r-M1", "stale", LATER).recordsById["r-M1"]?.qrAck).toBeDefined();
    expect(regenerate(s, "r-M1", LATER).recordsById["r-M1"]).toMatchObject({ qrStatus: "pending", qr: { source: "none" } });
  });
});

describe("plantilla y nombre", () => {
  it("cambiar de plantilla pone el layout base nuevo y borra las posiciones personalizadas", () => {
    const target = getTemplate("restaurant-default");
    if (!target) throw new Error("falta restaurant-default");
    const s = changeTemplate({ ...withThree(), layout: { ...withThree().layout, overrides: { "r-M1": {} } } }, target);
    expect(s).toMatchObject({ templateId: "restaurant-default", layout: { templateId: "restaurant-default", overrides: {} } });
    expect(s.layout.base).toEqual(target.defaultLayout);
  });

  it("el nombre se recorta y no cuenta como cambio si es igual", () => {
    const s = setProjectName(empty(), "x".repeat(300));
    expect(s.name).toHaveLength(200);
    expect(setProjectName(s, s.name)).toBe(s);
  });
});

describe("cuarentena", () => {
  it("descartarla vacía la lista y cuenta como cambio; si ya está vacía no cambia nada", () => {
    const s = { ...withThree(), quarantine: [{ raw: { id: "x" }, reason: "ilegible", at: NOW }] };
    const cleared = clearQuarantine(s);
    expect(cleared.quarantine).toEqual([]);
    expect(cleared.revision).toBe(s.revision + 1);
    expect(clearQuarantine(cleared)).toBe(cleared);
  });
});

describe("importRecords (Excel)", () => {
  const item = (row: number, overrides: Parameters<typeof draft>[0] = {}) => ({ row, draft: draft({ mesa: `M${row}`, menuUrl: `${MENU}?m=${row}`, ...overrides }), extra: {} });

  it("crea todas las piezas de golpe, con su fila y archivo de origen, y sube la revisión una sola vez", () => {
    const start = createEmptyProject(NOW, { id: "p" });
    const { state, created } = importRecords(start, [item(2), item(3), item(5)], { now: LATER, fileName: "mesas.xlsx", mode: "append" });
    expect(state.revision).toBe(start.revision + 1);
    expect(created).toHaveLength(3);
    expect(state.order).toEqual(created);
    expect(orderedRecords(state).map((r) => r.metadata)).toEqual([
      { origin: "excel", sourceFile: "mesas.xlsx", sourceRow: 2 },
      { origin: "excel", sourceFile: "mesas.xlsx", sourceRow: 3 },
      { origin: "excel", sourceFile: "mesas.xlsx", sourceRow: 5 },
    ]);
    expect(isPermutation(state.order, Object.keys(state.recordsById))).toBe(true);
  });

  it("añadir deja las piezas actuales y agrega al final; reemplazar las descarta", () => {
    const base = addRecord(createEmptyProject(NOW, { id: "p" }), draft({ mesa: "M0" }), NOW, { id: "old" }).state;
    const appended = importRecords(base, [item(2)], { now: LATER, fileName: "a.xlsx", mode: "append" }).state;
    expect(orderedRecords(appended).map((r) => r.mesa)).toEqual(["M0", "M2"]);
    const replaced = importRecords(base, [item(2)], { now: LATER, fileName: "a.xlsx", mode: "replace" }).state;
    expect(orderedRecords(replaced).map((r) => r.mesa)).toEqual(["M2"]);
    expect(replaced.recordsById["old"]).toBeUndefined();
  });

  it("regla crítica: con Link del QR nace como QR existente (nunca se generará otro); sin él, pendiente", () => {
    const { state } = importRecords(createEmptyProject(NOW), [item(2, { qrUrl: "https://cdn.example.com/qr/1.svg" }), item(3)], { now: LATER, fileName: "a.xlsx", mode: "append" });
    const [withQr, without] = orderedRecords(state);
    expect(withQr).toMatchObject({ qr: { source: "existing", verification: "unchecked" }, qrUrl: "https://cdn.example.com/qr/1.svg", qrStatus: "existing" });
    expect(without).toMatchObject({ qr: { source: "none" }, qrStatus: "pending" });
  });

  it("las copias apuntan a su original (fila del archivo o pieza existente)", () => {
    const base = addRecord(createEmptyProject(NOW), draft({ mesa: "M0" }), NOW, { id: "old" }).state;
    const { state, created } = importRecords(base, [item(2), { ...item(3), duplicateOf: { kind: "row", row: 2 } }, { ...item(4), duplicateOf: { kind: "record", recordId: "old" } }, { ...item(5), duplicateOf: { kind: "row", row: 99 } }], { now: LATER, fileName: "a.xlsx", mode: "append" });
    const meta = (index: number) => state.recordsById[created[index] ?? ""]?.metadata;
    expect(meta(1)?.duplicateOf).toBe(created[0]);
    expect(meta(2)?.duplicateOf).toBe("old");
    expect(meta(3)?.duplicateOf).toBeUndefined(); // la original no se importó
  });

  it("un Link del QR no seguro crea la pieza bloqueada con su error", () => {
    const { state } = importRecords(createEmptyProject(NOW), [{ ...item(2, { qrUrl: "https://cdn.example.com:8443/q.svg" }), qrIssue: "unsafe-url" }], { now: LATER, fileName: "a.xlsx", mode: "append" });
    expect(orderedRecords(state)[0]).toMatchObject({ qrStatus: "error", qrError: { code: "unsafe-url" } });
  });

  it("una pieza a corregir conserva lo leído y queda con errores de validación", () => {
    const { state } = importRecords(createEmptyProject(NOW), [{ row: 7, extra: { Notas: "x" }, draft: { area: "Bar", estacion: "", mesa: "", subgrupo: "", concepto: "", menuUrl: "no es url" } }], { now: LATER, fileName: "a.xlsx", mode: "append" });
    const record = orderedRecords(state)[0];
    expect(record?.validationErrors.filter((e) => e.severity === "error").map((e) => e.field).sort()).toEqual(["menuUrl", "mesa"]);
    expect(record?.metadata.extra).toEqual({ Notas: "x" });
  });
});
