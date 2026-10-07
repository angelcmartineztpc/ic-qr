import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/app/api-client";
import { ImportRejectedError } from "@/lib/app/import-client";
import { QrInflight } from "@/lib/app/qr-inflight";
import { detectHeaderRow } from "@/lib/excel/headers";
import { buildImportResult } from "@/lib/excel/import-pipeline";
import type { RawCell, RawSheet } from "@/lib/excel/types";
import { addRecord, createEmptyProject, markSaved, orderedRecords } from "@/lib/state/project";
import { createProjectStore, createSessionStore } from "@/lib/state/stores";
import type { LastImport } from "@/lib/state/last-import";
import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";
import type { ImportResult, RecordId } from "@/types";

import { draft, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { createImportActions } from "./import-actions";

const s = (v: string): RawCell => ({ t: "s", v, w: v });
const HEADER = ["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR"].map(s);
const dataRow = (area: string, mesa: string, menu: string, qr = ""): Array<RawCell | null> => [s(area), null, s(mesa), null, null, s(menu), qr ? s(qr) : null];

function excel(rows: Array<Array<RawCell | null>>, maxRows = 5000): ImportResult {
  const sheet: RawSheet = { name: "Mesas", state: "visible", rows: [HEADER, ...rows], merges: [], rowCount: rows.length + 1, colCount: 7 };
  const detected = detectHeaderRow(sheet.rows);
  if (!detected) throw new Error("sin cabecera");
  const out = buildImportResult({ fileName: "mesas.xlsx", sheet, headerRowIndex: 0, mapping: detected.mapping, maxRows });
  if (!out.ok) throw new Error(out.issues[0]?.code);
  return out.result;
}

const file = (name = "mesas.xlsx", size = 1000) => new File([new Uint8Array(size)], name);

function setup(options: { upload?: (file: File, options?: unknown) => Promise<ImportResult>; confirm?: (o: ConfirmOptions) => ConfirmResult; seed?: Parameters<typeof createEmptyProject>[1] & { dirtyRecords?: number } } = {}) {
  let initial = createEmptyProject(NOW, { id: "p" });
  for (let i = 0; i < (options.seed?.dirtyRecords ?? 0); i++) initial = addRecord(initial, draft({ mesa: `X${i}`, menuUrl: `${MENU}?x=${i}` }), NOW).state;
  const project = createProjectStore(initial);
  const session = createSessionStore({ hydrated: true });
  const notifications: NotifyOptions[] = [];
  const confirms: ConfirmOptions[] = [];
  const downloads: Array<{ name: string; blob: Blob }> = [];
  const resolved: RecordId[][] = [];
  const saved: LastImport[] = [];
  let cleared = 0;
  let navigated = 0;
  const runtime = {
    project,
    session,
    inflight: new QrInflight(),
    importSource: { file: null as File | null },
    lastImport: { save: async (v: LastImport) => void saved.push(v), clear: async () => void cleared++ },
  };
  const actions = createImportActions({
    runtime,
    notify: (n) => notifications.push(n),
    confirm: async (o) => (confirms.push(o), options.confirm ? options.confirm(o) : { confirmed: true, checked: false }),
    now: () => LATER,
    download: (name, blob) => downloads.push({ name, blob }),
    resolve: async (ids) => void resolved.push([...ids]),
    ...(options.upload ? { upload: ((f: File, o?: unknown) => options.upload!(f, o)) as never } : {}),
    goToPieces: () => void navigated++,
  });
  return { actions, project, session, notifications, confirms, downloads, resolved, saved, runtime, state: () => project.getState().project, imp: () => session.getState().import, cleared: () => cleared, navigated: () => navigated };
}

const sample = () =>
  excel([
    dataRow("Tropical", "M1", `${MENU}/1`),
    dataRow("Tropical", "M2", `${MENU}/2`, "https://cdn.example.com/qr/2.svg"),
    dataRow("Bar", "B1", ""), // error: falta menú
    dataRow("Tropical", "M1", `${MENU}/1`), // duplicada de la fila 2
  ]);

describe("archivo y errores", () => {
  it("rechaza en el cliente lo que no es .xlsx sin llamar al servidor", async () => {
    const t = setup({ upload: async () => { throw new Error("no debía llamarse"); } });
    expect(await t.actions.start(file("datos.csv"))).toBe(false);
    expect(t.imp()).toMatchObject({ status: "error", error: { message: expect.stringContaining(".xlsx") } });
  });

  it("un rechazo del archivo entero muestra el motivo; TOO_MANY_ROWS ofrece truncar", async () => {
    const issue = { row: null, field: "file" as const, value: null, label: "Demasiadas filas", message: "Hay más de 5000 filas con datos", severity: "error" as const, code: "TOO_MANY_ROWS" as const };
    const t = setup({ upload: async () => { throw new ImportRejectedError([issue]); } });
    await t.actions.start(file());
    expect(t.imp()).toMatchObject({ status: "error", error: { canTruncate: true, message: "Hay más de 5000 filas con datos" } });
  });

  it("un fallo del servidor (429, 500) conserva su mensaje", async () => {
    const t = setup({ upload: async () => { throw new ApiError(429, "BUSY", "El servidor está ocupado con otra operación; vuelve a intentarlo"); } });
    await t.actions.start(file());
    expect(t.imp().error?.message).toMatch(/ocupado/);
  });

  it("«Importar solo las primeras N» reenvía el mismo archivo con el límite", async () => {
    const calls: unknown[] = [];
    const t = setup({ upload: async (_f, options) => (calls.push(options), sample()) });
    await t.actions.start(file());
    await t.actions.importFirstRows(5000);
    expect(calls).toEqual([{}, { truncateTo: 5000 }]);
  });
});

describe("revisión y confirmación", () => {
  it("el resultado se guarda para sobrevivir a recargas", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    expect(t.imp().status).toBe("review");
    expect(t.saved).toHaveLength(1);
    expect(t.saved[0]?.result.rejected).toHaveLength(1);
  });

  it("confirmar crea las piezas válidas con su fila, deja listadas las erróneas y lanza el QR en lote", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    expect(await t.actions.confirm()).toBe(true);

    const records = orderedRecords(t.state());
    expect(records.map((r) => r.metadata.sourceRow)).toEqual([2, 3, 5]); // «Mantener»: incluye la copia
    expect(records.map((r) => r.qrStatus)).toEqual(["pending", "existing", "pending"]);
    expect(records[1]?.qrUrl).toBe("https://cdn.example.com/qr/2.svg");
    expect(t.imp()).toMatchObject({ status: "done", outcome: { created: 3, discarded: 0, fixes: 0 } });
    expect(t.resolved).toEqual([records.map((r) => r.id)]); // todas las piezas sin error propio
    expect(t.navigated()).toBe(1);
    expect(t.notifications.at(-1)).toMatchObject({ severity: "warning", message: "Excel importado: 3 piezas · 1 error" });
  });

  it("Eliminar duplicados: no crea la copia, la lista como descartada y el informe la incluye", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    t.actions.setStrategy("remove");
    await t.actions.confirm();
    expect(orderedRecords(t.state()).map((r) => r.metadata.sourceRow)).toEqual([2, 3]);
    expect(t.imp().outcome).toMatchObject({ discarded: 1, discardedRows: [5] });
    expect(t.notifications.at(-1)?.message).toContain("1 duplicado no importado");

    t.actions.downloadErrorReport();
    const csv = await t.downloads[0]!.blob.text();
    expect(t.downloads[0]!.name).toBe("errores-mesas.csv");
    expect(csv).toContain("Duplicado no importado");
    expect(csv).toContain("Falta Link del menú");
  });

  it("Revisar manualmente: parte de «descartar las copias» y respeta lo que cambie la persona", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    t.actions.setStrategy("review");
    expect(t.imp().decisions).toEqual({ 5: "discard" });
    expect(t.actions.currentPlan()?.plan.discarded).toHaveLength(1);
    t.actions.setDecision(5, "keep");
    expect(t.actions.currentPlan()?.plan.toCreate).toHaveLength(3);
  });

  it("duplicados contra el proyecto: la copia apunta a la pieza que ya existe", async () => {
    const t = setup({ upload: async () => excel([dataRow("Tropical", "M1", MENU)]), seed: { dirtyRecords: 0 } });
    t.project.setState({ project: addRecord(t.state(), draft({ mesa: "M1", estacion: "", menuUrl: MENU }), NOW, { id: "old" }).state });
    await t.actions.start(file());
    expect(t.actions.currentPlan()?.model.stats).toMatchObject({ valid: 0, duplicates: 1 });
    await t.actions.confirm();
    const created = orderedRecords(t.state()).find((r) => r.id !== "old");
    expect(created?.metadata.duplicateOf).toBe("old");
  });

  it("importar las filas con error como piezas a corregir las crea marcadas con errores y sin lanzar su QR", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    t.actions.setIncludeRejected(true);
    await t.actions.confirm();
    const fix = orderedRecords(t.state()).find((r) => r.metadata.sourceRow === 4);
    expect(fix?.validationErrors.some((e) => e.severity === "error")).toBe(true);
    expect(t.imp().outcome?.fixes).toBe(1);
    expect(t.resolved[0]).not.toContain(fix?.id);
  });

  it("reemplazar con cambios sin guardar pide confirmación; si se cancela no cambia nada", async () => {
    const t = setup({ upload: async () => sample(), confirm: () => ({ confirmed: false, checked: false }), seed: { dirtyRecords: 2 } });
    await t.actions.start(file());
    t.actions.setMode("replace");
    expect(await t.actions.confirm()).toBe(false);
    expect(t.confirms.at(-1)).toMatchObject({ title: "Tienes cambios sin guardar.", message: "Se reemplazarán las 2 piezas actuales." });
    expect(orderedRecords(t.state())).toHaveLength(2);
  });

  it("reemplazar sin cambios pendientes no pregunta", async () => {
    const t = setup({ upload: async () => sample(), seed: { dirtyRecords: 2 } });
    t.project.setState({ project: markSaved(t.state(), NOW) });
    await t.actions.start(file());
    t.actions.setMode("replace");
    expect(await t.actions.confirm()).toBe(true);
    expect(orderedRecords(t.state()).map((r) => r.metadata.sourceRow)).toEqual([2, 3, 5]);
    expect(t.confirms).toHaveLength(0);
  });

  it("sin columnas obligatorias no se puede confirmar hasta aplicar el mapeo", async () => {
    const sheet: RawSheet = { name: "Mesas", state: "visible", rows: [["Área", "Concepto", "Link del menú"].map(s), [s("Bar"), s("x"), s(MENU)]], merges: [], rowCount: 2, colCount: 3 };
    const detected = detectHeaderRow(sheet.rows)!;
    const out = buildImportResult({ fileName: "m.xlsx", sheet, headerRowIndex: 0, mapping: detected.mapping, maxRows: 5000 });
    const needs = out.ok ? out.result : sample();
    const t = setup({ upload: async () => needs });
    await t.actions.start(file());
    expect(await t.actions.confirm()).toBe(false);
    expect(t.saved).toHaveLength(0); // un resultado sin mapear no se persiste
    expect(orderedRecords(t.state())).toHaveLength(0);
  });
});

describe("descartar", () => {
  it("pide confirmación, borra lo guardado y deja la pantalla en blanco", async () => {
    const t = setup({ upload: async () => sample() });
    await t.actions.start(file());
    expect(await t.actions.discardResult()).toBe(true);
    expect(t.confirms.at(-1)?.title).toBe("¿Descartar esta importación?");
    expect(t.imp().status).toBe("idle");
    expect(t.cleared()).toBe(1);
  });

  it("si la persona cancela, el resultado sigue ahí", async () => {
    const t = setup({ upload: async () => sample(), confirm: () => ({ confirmed: false, checked: false }) });
    await t.actions.start(file());
    expect(await t.actions.discardResult()).toBe(false);
    expect(t.imp().status).toBe("review");
  });
});
