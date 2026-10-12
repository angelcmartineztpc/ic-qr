import { ExportCancelledError, ExportClientError, runExportJob, type ExportResult } from "@/lib/export/client";
import { buildExportRequest, type BuiltExport } from "@/lib/export/build-request";
import { layoutWarnings } from "@/lib/layout/warnings";
import { resolveLayout } from "@/lib/layout/resolve-layout";
import { resolveQrDecision } from "@/lib/records/qr-state";
import { markSaved } from "@/lib/state/project";
import type { Runtime } from "@/lib/state/StoreProvider";
import { initialGeneration, isGenerating, patchSession, updateProject } from "@/lib/state/stores";
import { getTemplate } from "@/templates";
import type { QRRecord, RecordId } from "@/types";

import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";

export interface ExportDeps {
  runtime: Pick<Runtime, "project" | "session" | "inflight">;
  notify(options: NotifyOptions): void;
  confirm(options: ConfirmOptions): Promise<ConfirmResult>;
  now(): Date;
  download(fileName: string, blob: Blob): void;
  /** Resuelve (genera o verifica) los QR de estas piezas, con progreso y cancelación. */
  resolve(ids: readonly RecordId[]): Promise<unknown>;
  /** Va a corregir una pieza en /editor. */
  goToFix?: (recordId: RecordId) => void;
  runJob?: typeof runExportJob;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = (r: QRRecord) => [r.mesa, r.area].filter(Boolean).join(" · ") || "pieza sin nombre";

/**
 * Generar y descargar el PDF (§S5, §1.2-22): resuelve los QR pendientes, avisa de lo que
 * bloquea (con salida: corregir o excluir), confirma si hay solapes, pide la
 * exportación al servidor y descarga. Cancelar detiene todo; nada queda a medias.
 */
export function createExportActions(deps: ExportDeps) {
  const { runtime, notify } = deps;
  const project = () => runtime.project.getState().project;
  const session = () => runtime.session.getState();
  const patchGeneration = (patch: Partial<ReturnType<typeof initialGeneration>>) => patchSession(runtime.session, (s) => ({ generation: { ...s.generation, ...patch } }));
  const runJob = deps.runJob ?? runExportJob;
  let controller: AbortController | null = null;
  let cancelled = false;

  const build = (): BuiltExport => buildExportRequest(project(), session().excluded, deps.now());
  const needsQr = (record: QRRecord) => !record.qrError && !record.validationErrors.some((i) => i.severity === "error") && ["generate", "check-existing"].includes(resolveQrDecision(record));

  function showBlocked(blocked: Array<{ recordId: RecordId; reason: string }>): void {
    patchSession(runtime.session, { exportReview: { blocked } });
    // El diálogo es modal y lleva el mensaje y las dos salidas: no se añade un aviso que quedaría en cola detrás de otros.
    patchGeneration({ phase: "idle" });
  }

  function overlapping(built: BuiltExport): number {
    const template = getTemplate(project().templateId);
    if (!template) return 0;
    const spec = { width: template.tile.width, height: template.tile.height, safeMarginMm: template.tile.safeMarginMm };
    return built.included.filter((r) => layoutWarnings(resolveLayout(project().layout, r.id), spec).some((w) => w.code === "OVERLAP")).length;
  }

  function fail(error: unknown, retry: () => void): void {
    if (error instanceof ExportCancelledError) {
      patchGeneration({ phase: "cancelled" });
      notify({ message: "Descarga cancelada", severity: "info", group: "export" });
      patchGeneration({ ...initialGeneration() });
      return;
    }
    patchGeneration({ phase: "error" });
    if (!(error instanceof ExportClientError)) {
      notify({ message: `Error al generar el PDF: ${error instanceof Error ? error.message : "error desconocido"}`, severity: "error", group: "export" });
      return;
    }
    const records = project().recordsById;
    switch (error.code) {
      case "STREAM_TRUNCATED":
        notify({ message: "La descarga se interrumpió", severity: "error", group: "export", action: { label: "Reintentar", onClick: retry } });
        return;
      case "NETWORK":
        notify({ message: error.message, severity: "error", group: "export", action: { label: "Reintentar", onClick: retry } });
        return;
      case "NOT_VALID":
        if (error.details.length > 0) {
          showBlocked(error.details.flatMap((d) => (d.recordId ? [{ recordId: d.recordId, reason: d.message }] : [])));
          return;
        }
        break;
      case "QR_IDENTITY_MISMATCH":
      case "QR_UNRESOLVED": {
        const record = error.recordId ? records[error.recordId] : undefined;
        if (error.recordId) patchSession(runtime.session, { exportReview: { blocked: [{ recordId: error.recordId, reason: error.message }] } });
        notify({ message: `Error al generar el PDF${record ? ` (${label(record)})` : ""}: ${error.message}`, severity: "error", group: "export" });
        return;
      }
      case "RATE_LIMITED":
      case "BUSY":
        notify({ message: error.message, severity: "warning", group: "export", action: { label: "Reintentar", onClick: retry } });
        return;
      default:
        break;
    }
    notify({ message: error.code === "EXPORT_TIMEOUT" || error.code === "DRAINING" || error.code === "FONTS_MISSING" ? error.message : `Error al generar el PDF: ${error.message}`, severity: "error", group: "export" });
  }

  function deliver(result: ExportResult): void {
    const pdf = result.files.pdf;
    const zip = result.files.zip;
    if (pdf) deps.download(pdf.name, pdf.blob);
    else if (zip) deps.download(zip.name, zip.blob);
    // La descarga cuenta como «guardado»: ya no hay cambios sin exportar (savedRevision).
    updateProject(runtime.project, (p) => markSaved(p, deps.now().toISOString()));
    patchGeneration({ phase: "done", result: { pieces: result.done.pieces, pages: result.done.pages, warnings: result.done.warnings, zip: pdf && zip ? { name: zip.name, blob: zip.blob } : null } });
    const warned = result.done.warnings > 0;
    notify({
      message: warned ? `PDF descargado correctamente (${plural(result.done.warnings, "aviso de composición", "avisos de composición")}: revisa las piezas)` : "PDF descargado correctamente",
      severity: warned ? "warning" : "success",
      group: "export",
      ...(pdf && zip ? { action: { label: "Descargar ZIP", onClick: () => deps.download(zip.name, zip.blob) } } : {}),
    });
  }

  const actions = {
    /** Genera y descarga. Devuelve true si se entregó el archivo. */
    async start(): Promise<boolean> {
      if (isGenerating(session().generation)) return false;
      cancelled = false;
      patchSession(runtime.session, { exportReview: null });
      patchGeneration({ ...initialGeneration() });

      let built = build();
      if (built.included.length === 0) {
        notify({ message: "No hay piezas para exportar", severity: "info", group: "export" });
        return false;
      }

      // 1. QR pendientes o sin verificar: se resuelven primero, en lote y con progreso.
      const pending = built.included.filter(needsQr).map((r) => r.id);
      if (pending.length > 0) {
        patchGeneration({ phase: "resolving", total: pending.length });
        await deps.resolve(pending);
        if (cancelled) {
          patchGeneration({ ...initialGeneration() });
          notify({ message: "Descarga cancelada", severity: "info", group: "export" });
          return false;
        }
        built = build();
      }

      // 2. Lo que bloquea: se muestra con su salida (corregir o excluir), nunca se exporta a medias.
      if (built.blocked.length > 0) {
        showBlocked(built.blocked);
        return false;
      }

      // 3. Solape entre el QR y el texto: se puede exportar, pero con confirmación.
      const overlaps = overlapping(built);
      if (overlaps > 0) {
        const ok = (
          await deps.confirm({
            title: `El QR se solapa con el texto en ${plural(overlaps, "pieza", "piezas")}.`,
            message: "Puede que el QR no se lea o que el texto quede tapado. ¿Generar el PDF de todos modos?",
            confirmLabel: "Generar de todos modos",
          })
        ).confirmed;
        if (!ok) {
          patchGeneration({ ...initialGeneration() });
          return false;
        }
      }

      // 4. Exportación en el servidor.
      controller = new AbortController();
      patchGeneration({ phase: "generating", done: 0, total: built.included.length, bytes: 0, size: 0 });
      try {
        const result = await runJob(
          built.request,
          {
            onPhase: (p) => {
              if (p.phase === "downloading") patchGeneration({ phase: "downloading", bytes: p.bytes, size: p.size });
              else patchGeneration({ phase: p.phase, done: p.done, total: p.total });
            },
          },
          controller.signal,
        );
        deliver(result);
        return true;
      } catch (error) {
        fail(error, () => void actions.start());
        return false;
      } finally {
        controller = null;
      }
    },

    /** Cancelar: mientras se resuelven los QR, detiene esa resolución; después, aborta la petición. */
    cancel(): void {
      cancelled = true;
      if (controller) controller.abort();
      else runtime.inflight.abortAll();
    },

    /** Vuelve a incluir todas las piezas excluidas. */
    includeAll(): void {
      patchSession(runtime.session, { excluded: [] });
    },

    dismissReview(): void {
      patchSession(runtime.session, { exportReview: null });
    },

    /** [Ir a corregir]: cierra el diálogo y lleva a la primera pieza que bloquea. */
    fixBlocked(): void {
      const first = session().exportReview?.blocked[0];
      patchSession(runtime.session, { exportReview: null });
      if (first) deps.goToFix?.(first.recordId);
    },

    /** [Excluir N piezas de esta exportación]: no viajan, y la numeración es 1…n sobre el resto. */
    async excludeBlocked(): Promise<void> {
      const blocked = session().exportReview?.blocked ?? [];
      patchSession(runtime.session, (s) => ({ excluded: [...new Set([...s.excluded, ...blocked.map((b) => b.recordId)])], exportReview: null }));
      await actions.start();
    },

    downloadZip(): void {
      const zip = session().generation.result?.zip;
      if (zip) deps.download(zip.name, zip.blob);
    },

    closeResult(): void {
      patchGeneration({ ...initialGeneration() });
    },
  };
  return actions;
}

export type ExportActions = ReturnType<typeof createExportActions>;
