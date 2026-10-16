import { describe, expect, it } from "vitest";

import { DEFAULT_QR_STYLE } from "@/schemas/qr-style";
import { EditorHistory } from "@/lib/state/history";
import { addRecord, createEmptyProject } from "@/lib/state/project";
import { createProjectStore, createSessionStore } from "@/lib/state/stores";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";

import { draft, NOW } from "../../../tests/helpers/records";
import { createEditorActions } from "./editor-actions";

function setup() {
  let project = createEmptyProject(NOW, { id: "p" });
  project = addRecord(project, draft({ mesa: "M1" }), NOW, { id: "a" }).state;
  project = addRecord(project, draft({ mesa: "M2" }), NOW, { id: "b" }).state;
  const store = createProjectStore(project);
  const session = createSessionStore({ hydrated: true });
  session.setState((s) => ({ ...s, selection: { ...s.selection, currentId: "a" } }));
  const history = new EditorHistory();
  const notifications: NotifyOptions[] = [];
  const actions = createEditorActions({ runtime: { project: store, session, history }, notify: (n) => notifications.push(n) });
  return { actions, store, session, history, notifications, state: () => store.getState().project };
}

describe("setBox (reglas del editor)", () => {
  it("guarda la caja y es UNA entrada de deshacer; deshacer/rehacer la restauran", () => {
    const t = setup();
    const start = t.state().layout.base.qr;
    expect(t.actions.setBox("qr", { ...start, x: start.x + 2 })).toEqual({ ok: true });
    expect(t.state().layout.base.qr.x).toBe(start.x + 2);
    expect(t.history.canUndo).toBe(true);
    expect(t.actions.undo()).toBe(true);
    expect(t.state().layout.base.qr).toEqual(start);
    expect(t.actions.redo()).toBe(true);
    expect(t.state().layout.base.qr.x).toBe(start.x + 2);
    expect(t.actions.undo() && t.actions.undo()).toBe(false);
  });

  it("nunca corrige en silencio: fuera de la pieza, demasiado pequeña o QR no cuadrado se rechaza con motivo", () => {
    const t = setup();
    const qr = t.state().layout.base.qr;
    expect(t.actions.setBox("qr", { ...qr, x: 60 })).toMatchObject({ ok: false, message: expect.stringContaining("dentro de la pieza") });
    expect(t.actions.setBox("content", { x: 1, y: 1, width: 2, height: 20 })).toMatchObject({ ok: false, message: expect.stringContaining("mínimo") });
    expect(t.actions.setBox("qr", { ...qr, height: qr.height + 3 })).toMatchObject({ ok: false, message: "El QR debe ser cuadrado" });
    expect(t.history.canUndo).toBe(false);
    expect(t.state().layout.base.qr).toEqual(qr);
  });

  it("sin cambio no ensucia el proyecto ni el historial", () => {
    const t = setup();
    const revision = t.state().revision;
    t.actions.setBox("qr", t.state().layout.base.qr);
    expect(t.state().revision).toBe(revision);
    expect(t.history.canUndo).toBe(false);
  });

  it("«Solo esta pieza» escribe en su override y las demás siguen la base", () => {
    const t = setup();
    t.actions.setScope("single");
    t.actions.setBox("qr", { ...t.state().layout.base.qr, x: 10 });
    expect(t.state().layout.overrides["a"]?.qr?.x).toBe(10);
    expect(t.state().layout.base.qr.x).not.toBe(10);
    expect(t.actions.layout().qr.x).toBe(10);
    expect(t.actions.customized("qr")).toEqual(["a"]);
    t.actions.resetPiece();
    expect(t.state().layout.overrides["a"]).toBeUndefined();
  });
});

describe("presets, ajuste del texto y plantilla", () => {
  it("los presets mueven el QR conservando su tamaño", () => {
    const t = setup();
    const side = t.state().layout.base.qr.width;
    t.actions.applyPreset("bottom-left");
    expect(t.state().layout.base.qr).toMatchObject({ x: 2, width: side });
    t.actions.applyPreset("center");
    expect(t.state().layout.base.qr.x).toBeCloseTo((70 - side) / 2, 2);
  });

  it("«Centro» solapa y avisa; «Ajustar bloque de texto» lo termina 1 mm sobre el QR", () => {
    const t = setup();
    t.actions.applyPreset("center");
    expect(t.notifications.at(-1)?.message).toContain("solapa");
    expect(t.actions.fitContentAboveQr()).toEqual({ ok: true });
    const { content, qr } = t.state().layout.base;
    expect(content.y + content.height).toBeCloseTo(qr.y - 1, 2);
  });

  it("un override de plantilla inválido (peso no declarado) se rechaza con mensaje y no se guarda", () => {
    const t = setup();
    const bad = t.actions.setTemplateOverrides({ items: { area: { weight: 300 } }, qr: {}, tile: {}, qrStyle: DEFAULT_QR_STYLE });
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining("no declarada") });
    expect(t.state().templateOverrides.items).toEqual({});
    expect(t.actions.setTemplateOverrides({ items: { area: { sizePt: 14 } }, qr: {}, tile: {}, qrStyle: DEFAULT_QR_STYLE })).toEqual({ ok: true });
    expect(t.state().templateOverrides.items["area"]?.sizePt).toBe(14);
    t.actions.undo();
    expect(t.state().templateOverrides.items).toEqual({});
  });

  it("opciones del PDF: se guardan, se deshacen y el conteo respeta las exclusiones", () => {
    const t = setup();
    t.actions.setPdfOptions({ gapMm: 8 });
    expect(t.state().exportOptions.pdf.gapMm).toBe(8);
    t.actions.undo();
    expect(t.state().exportOptions.pdf.gapMm).toBe(5);
    expect(t.actions.exportCount()).toBe(2);
    t.session.setState((s) => ({ ...s, excluded: ["b"] }));
    expect(t.actions.exportCount()).toBe(1);
  });

  it("escribir el nombre del archivo no crea entradas de deshacer", () => {
    const t = setup();
    t.actions.setFileName("Mesas");
    expect(t.state().exportOptions.fileName).toBe("Mesas");
    expect(t.history.canUndo).toBe(false);
  });
});
