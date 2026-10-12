import { MIN_BOX_MM, boxesOverlap, isInside, roundMm } from "@/lib/layout/geometry";
import { qrPresetBox } from "@/lib/layout/presets";
import { round } from "@/lib/units";
import { resolveLayout } from "@/lib/layout/resolve-layout";
import { applyBaseToCustomized, customizedIds, editorSnapshot, orderedRecords, resetPieceLayout, restoreEditorSnapshot, setExportFileName, setExportFormats, setLayoutBox, setPdfOptions, setTemplateOverrides } from "@/lib/state/project";
import type { Runtime } from "@/lib/state/StoreProvider";
import { patchSession, updateProject, type EditorUiState } from "@/lib/state/stores";
import { resolveTemplate } from "@/lib/template/resolve";
import { getTemplate } from "@/templates";
import type { Box, Layout, PDFOptions, QrPreset, RecordId, TemplateOverrides } from "@/types";

import type { NotifyOptions } from "@/components/ui/NotificationsProvider";

export interface EditorDeps {
  runtime: Pick<Runtime, "project" | "session" | "history">;
  notify(options: NotifyOptions): void;
}

export type EditResult = { ok: true } | { ok: false; message: string };

/**
 * Acciones del editor visual. Cada confirmación del usuario (soltar el ratón,
 * Enter, una flecha, elegir un preset) guarda UNA entrada de deshacer; nunca
 * se corrige en silencio un valor fuera de rango: se rechaza con un mensaje.
 */
export function createEditorActions(deps: EditorDeps) {
  const { runtime, notify } = deps;
  const project = () => runtime.project.getState().project;
  const session = () => runtime.session.getState();
  const tile = () => {
    const template = getTemplate(project().templateId);
    if (!template) throw new Error(`Plantilla desconocida: ${project().templateId}`);
    return { template, spec: { width: template.tile.width, height: template.tile.height, safeMarginMm: template.tile.safeMarginMm } };
  };
  /** Pieza en pantalla: la seleccionada o, si no hay selección válida, la primera. */
  const currentId = (): RecordId | null => {
    const { order } = project();
    const selected = session().selection.currentId;
    return selected && order.includes(selected) ? selected : (order[0] ?? null);
  };
  const scope = () => {
    const id = currentId();
    return session().editor.scope === "single" && id ? ({ kind: "single", recordId: id } as const) : ({ kind: "all" } as const);
  };
  const mutate = (change: (p: ReturnType<typeof project>) => ReturnType<typeof project>) => {
    runtime.history.push(editorSnapshot(project()));
    updateProject(runtime.project, change);
  };
  const patchEditor = (patch: Partial<EditorUiState>) => patchSession(runtime.session, (s) => ({ editor: { ...s.editor, ...patch } }));

  /** Caja efectiva de la pieza actual (con su override si lo tiene). */
  const layout = (): Layout => {
    const id = currentId();
    return id ? resolveLayout(project().layout, id) : project().layout.base;
  };

  const actions = {
    layout,
    patchEditor,

    setScope(next: EditorUiState["scope"]): void {
      patchEditor({ scope: next });
    },

    /** Valida y guarda una caja. QR siempre cuadrado, dentro de la pieza y con tamaño mínimo. */
    setBox(key: keyof Layout, box: Box): EditResult {
      const { spec } = tile();
      // 0.001 mm: no altera las medidas con tres decimales de la plantilla (p. ej. 24.788) al editar otra coordenada.
      const r = (v: number) => round(v, 0.001);
      const next: Box = { x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height) };
      if (next.width < MIN_BOX_MM || next.height < MIN_BOX_MM) return { ok: false, message: `El mínimo es ${MIN_BOX_MM} mm de ancho y de alto` };
      if (key === "qr" && Math.abs(next.width - next.height) > 1e-6) return { ok: false, message: "El QR debe ser cuadrado" };
      if (!isInside(next, spec)) return { ok: false, message: `Debe quedar dentro de la pieza (${spec.width} × ${spec.height} mm)` };
      const current = layout()[key];
      const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;
      if (same(current.x, next.x) && same(current.y, next.y) && same(current.width, next.width) && same(current.height, next.height)) return { ok: true };
      mutate((p) => setLayoutBox(p, key, next, scope()));
      return { ok: true };
    },

    applyPreset(preset: Exclude<QrPreset, "custom">): void {
      const { spec } = tile();
      const box = qrPresetBox(preset, layout().qr.width, spec);
      actions.setBox("qr", box);
      if (boxesOverlap(box, layout().content)) notify({ message: "El QR se solapa con el bloque de texto. Usa «Ajustar bloque de texto» o muévelo.", severity: "warning", group: "records" });
    },

    /** [Ajustar bloque de texto]: lo acorta para que termine 1 mm por encima del QR. */
    fitContentAboveQr(): EditResult {
      const { content, qr } = layout();
      const height = roundMm(qr.y - 1 - content.y);
      if (height < MIN_BOX_MM) return { ok: false, message: "No hay espacio sobre el QR para el bloque de texto" };
      return actions.setBox("content", { ...content, height });
    },

    /** Piezas con posición propia en la caja dada (avisa cuando se edita «Todas»). */
    customized: (key: keyof Layout): RecordId[] => customizedIds(project(), key),

    applyToCustomized(key: keyof Layout): void {
      mutate((p) => applyBaseToCustomized(p, key));
    },

    resetPiece(): void {
      const id = currentId();
      if (id) mutate((p) => resetPieceLayout(p, id));
    },

    /** Ajustes de plantilla: se re-validan con TemplateSchema; uno inválido (peso no declarado…) se rechaza con mensaje. */
    setTemplateOverrides(next: TemplateOverrides): EditResult {
      const { template } = tile();
      const result = resolveTemplate(template, next);
      if (!result.success) return { ok: false, message: result.error.issues[0]?.message ?? "Ajuste de plantilla no válido" };
      mutate((p) => setTemplateOverrides(p, next));
      return { ok: true };
    },

    setPdfOptions(patch: Partial<PDFOptions>): void {
      mutate((p) => setPdfOptions(p, patch));
    },

    /** Formatos de salida (PDF y/o ZIP de SVG): al menos uno. */
    setFormats(formats: Array<"pdf" | "svgZip">, zipNaming?: "index" | "index-area-mesa"): void {
      if (formats.length === 0) return;
      mutate((p) => setExportFormats(p, { formats, ...(zipNaming ? { zipNaming } : {}) }));
    },

    setFileName(name: string): void {
      updateProject(runtime.project, (p) => setExportFileName(p, name)); // escribir no es una entrada de deshacer
    },

    undo(): boolean {
      const target = runtime.history.undo(editorSnapshot(project()));
      if (!target) return false;
      updateProject(runtime.project, (p) => restoreEditorSnapshot(p, target));
      return true;
    },
    redo(): boolean {
      const target = runtime.history.redo(editorSnapshot(project()));
      if (!target) return false;
      updateProject(runtime.project, (p) => restoreEditorSnapshot(p, target));
      return true;
    },

    /** Piezas que entran en una exportación (las excluidas no cuentan). */
    exportCount(): number {
      const excluded = new Set(session().excluded);
      return orderedRecords(project()).filter((r) => !excluded.has(r.id)).length;
    },
  };
  return actions;
}

export type EditorActions = ReturnType<typeof createEditorActions>;
