import { describe, expect, it } from "vitest";

import { EditorHistory } from "./history";
import { addRecord, applyBaseToCustomized, createEmptyProject, customizedIds, editorSnapshot, resetPieceLayout, restoreEditorSnapshot, setExportFileName, setLayoutBox, setPdfOptions } from "./project";

import { draft, NOW } from "../../../tests/helpers/records";

const box = (x: number) => ({ x, y: 10, width: 20, height: 20 });
const base = () => addRecord(addRecord(createEmptyProject(NOW, { id: "p" }), draft({ mesa: "M1" }), NOW, { id: "a" }).state, draft({ mesa: "M2" }), NOW, { id: "b" }).state;

describe("EditorHistory", () => {
  it("deshace y rehace en orden y rehacer se borra con un cambio nuevo", () => {
    const history = new EditorHistory();
    const s0 = editorSnapshot(createEmptyProject(NOW));
    const s1 = { ...s0, fileNameTouched: true };
    const s2 = { ...s0, fileNameTouched: false, layout: { ...s0.layout, overrides: { x: {} } } };
    history.push(s0);
    history.push(s1);
    expect(history.canUndo).toBe(true);
    expect(history.undo(s2)).toBe(s1);
    expect(history.undo(s1)).toBe(s0);
    expect(history.undo(s0)).toBeNull();
    expect(history.redo(s0)).toBe(s1);
    history.push(s2); // un cambio nuevo descarta lo «rehacible»
    expect(history.canRedo).toBe(false);
  });

  it("limita la profundidad y avisa a los suscriptores", () => {
    const history = new EditorHistory();
    let calls = 0;
    const off = history.subscribe(() => calls++);
    const snapshot = editorSnapshot(createEmptyProject(NOW));
    for (let i = 0; i < 150; i++) history.push(snapshot);
    expect(calls).toBe(150);
    let undone = 0;
    while (history.undo(snapshot)) undone++;
    expect(undone).toBe(100);
    off();
    const after = calls;
    history.clear();
    expect(calls).toBe(after); // ya no está suscrito
  });
});

describe("diseño del proyecto", () => {
  it("«Todas» cambia la base y «Solo esta pieza» crea un override", () => {
    const all = setLayoutBox(base(), "qr", box(5), { kind: "all" });
    expect(all.layout.base.qr).toEqual(box(5));
    expect(all.layout.overrides).toEqual({});
    const single = setLayoutBox(base(), "qr", box(7), { kind: "single", recordId: "a" });
    expect(single.layout.overrides["a"]?.qr).toEqual(box(7));
    expect(single.layout.base.qr).not.toEqual(box(7));
    expect(single.revision).toBe(base().revision + 1);
  });

  it("restablecer una pieza y aplicar la base a las personalizadas", () => {
    let project = setLayoutBox(base(), "qr", box(7), { kind: "single", recordId: "a" });
    project = setLayoutBox(project, "content", { x: 3, y: 3, width: 30, height: 10 }, { kind: "single", recordId: "b" });
    expect(customizedIds(project, "qr")).toEqual(["a"]);
    const applied = applyBaseToCustomized(project, "qr");
    expect(customizedIds(applied, "qr")).toEqual([]);
    expect(applied.layout.overrides["b"]?.content).toBeDefined(); // la otra caja de «b» no se toca
    expect(applied.layout.overrides["a"]).toBeUndefined(); // sin cajas propias: el override desaparece
    expect(resetPieceLayout(project, "a").layout.overrides["a"]).toBeUndefined();
    expect(resetPieceLayout(project, "zzz")).toBe(project);
  });

  it("nombre de archivo: escribir lo marca como tocado y vaciarlo lo suelta", () => {
    const named = setExportFileName(base(), "Mesas LBLC");
    expect(named).toMatchObject({ fileNameTouched: true, exportOptions: { fileName: "Mesas LBLC" } });
    expect(setExportFileName(named, "")).toMatchObject({ fileNameTouched: false });
    expect(setExportFileName(named, "Mesas LBLC")).toBe(named);
  });

  it("restaurar una instantánea devuelve diseño, plantilla y opciones, no las piezas", () => {
    const start = base();
    const snapshot = editorSnapshot(start);
    let next = setPdfOptions(setLayoutBox(start, "qr", box(9), { kind: "all" }), { gapMm: 9 });
    next = addRecord(next, draft({ mesa: "M3" }), NOW, { id: "c" }).state;
    const restored = restoreEditorSnapshot(next, snapshot);
    expect(restored.layout).toBe(start.layout);
    expect(restored.exportOptions.pdf.gapMm).toBe(start.exportOptions.pdf.gapMm);
    expect(Object.keys(restored.recordsById)).toEqual(["a", "b", "c"]);
  });
});
