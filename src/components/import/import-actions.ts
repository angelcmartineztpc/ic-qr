import { ApiError } from "@/lib/app/api-client";
import { checkFileBeforeUpload, ImportRejectedError, uploadExcel, type UploadOptions } from "@/lib/app/import-client";
import { buildErrorReport } from "@/lib/excel/error-report";
import { resultNeedsMapping } from "@/lib/excel/import-pipeline";
import { planImport, planSize, reviewImport, validRows, type ImportPlan, type ReviewModel } from "@/lib/excel/review";
import { defaultReviewDecisions } from "@/lib/records/duplicates";
import { importRecords, isDirty, orderedRecords, setDuplicateKey, type ImportItem } from "@/lib/state/project";
import type { Runtime } from "@/lib/state/StoreProvider";
import { initialImport, patchSession, updateProject, type ImportSession } from "@/lib/state/stores";
import type { DuplicateDecision, DuplicateKeyConfig, DuplicateStrategy, FieldKey, ImportedRow, ImportResult, RecordId, RejectedRow } from "@/types";

import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";

export interface ImportDeps {
  runtime: Pick<Runtime, "project" | "session" | "inflight" | "lastImport" | "importSource">;
  notify(options: NotifyOptions): void;
  confirm(options: ConfirmOptions): Promise<ConfirmResult>;
  now(): string;
  download(fileName: string, blob: Blob): void;
  /** Resolución de QR en lote (con progreso y cancelación) de las acciones del builder. */
  resolve(ids: readonly RecordId[]): Promise<unknown>;
  upload?: typeof uploadExcel;
  /** Navega a la lista de piezas tras confirmar. */
  goToPieces?: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function itemOf(row: ImportedRow, duplicateOf?: ImportItem["duplicateOf"]): ImportItem {
  const qrIssue = row.issues.some((i) => i.code === "QR_URL_UNSAFE") ? "unsafe-url" : row.issues.some((i) => i.code === "QR_URL_HOST_NOT_ALLOWED") ? "host-not-allowed" : undefined;
  return { draft: row.draft, row: row.row, extra: row.extra, ...(duplicateOf ? { duplicateOf } : {}), ...(qrIssue ? { qrIssue } : {}) };
}

/** Una fila con error como «pieza a corregir»: conserva lo que se pudo leer; la validación del registro marca lo que falta. */
function fixItemOf(row: RejectedRow): ImportItem {
  const raw = (field: FieldKey) => row.raw[field] ?? "";
  const qrUrl = raw("qrUrl").trim();
  return { row: row.row, extra: row.extra, draft: { area: raw("area"), estacion: raw("estacion"), mesa: raw("mesa"), subgrupo: raw("subgrupo"), concepto: raw("concepto"), menuUrl: raw("menuUrl"), ...(qrUrl === "" ? {} : { qrUrl }) } };
}

export function createImportActions(deps: ImportDeps) {
  const { runtime, notify, now } = deps;
  const project = () => runtime.project.getState().project;
  const session = () => runtime.session.getState();
  const patchImport = (patch: Partial<ImportSession>) => patchSession(runtime.session, (s) => ({ import: { ...s.import, ...patch } }));
  const upload = deps.upload ?? uploadExcel;
  let controller: AbortController | null = null;

  /** Duplicados contra las piezas que ya existen: ninguna al reemplazar. */
  function review(result: ImportResult, mode: ImportSession["mode"] = session().import.mode): ReviewModel {
    const existing = mode === "replace" ? [] : orderedRecords(project());
    return reviewImport(result, project().duplicateKey, existing);
  }

  function currentPlan(): { result: ImportResult; model: ReviewModel; plan: ImportPlan } | null {
    const { result, mode, strategy, decisions, includeRejected } = session().import;
    if (!result) return null;
    const model = review(result, mode);
    return { result, model, plan: planImport(result, model, { strategy, decisions, includeRejected }) };
  }

  async function run(file: File, options: UploadOptions): Promise<boolean> {
    controller?.abort();
    controller = new AbortController();
    runtime.importSource.file = file;
    const defaultMenuUrl = runtime.importSource.defaultMenuUrl.trim();
    if (defaultMenuUrl !== "") options = { ...options, defaultMenuUrl };
    patchImport({ status: "uploading", error: null });
    try {
      const result = await upload(file, options, controller.signal);
      patchImport({ status: "review", result, error: null, outcome: null, decisions: {} });
      if (!resultNeedsMapping(result)) void runtime.lastImport.save({ result, outcome: null });
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return false;
      if (error instanceof ImportRejectedError) {
        const first = error.issues[0];
        patchImport({ status: "error", error: { message: first?.message ?? error.message, issues: error.issues, canTruncate: first?.code === "TOO_MANY_ROWS" } });
      } else {
        const message = error instanceof ApiError ? error.message : "No se pudo enviar el archivo. Revisa tu conexión e inténtalo de nuevo.";
        patchImport({ status: "error", error: { message, issues: [], canTruncate: false } });
      }
      return false;
    }
  }

  function reviewDecisions(result: ImportResult, mode: ImportSession["mode"]): Record<number, DuplicateDecision> {
    const model = review(result, mode);
    return defaultReviewDecisions(model.rows, model.fileGroups, model.projectGroups);
  }

  const actions = {
    review,
    currentPlan,

    /** Empieza una importación nueva con un archivo elegido o soltado. */
    /** `defaultMenuUrl`: Link del menú para las filas que no lo traen (opcional). */
    async start(file: File, defaultMenuUrl = ""): Promise<boolean> {
      runtime.importSource.defaultMenuUrl = defaultMenuUrl;
      const problem = checkFileBeforeUpload(file);
      if (problem) {
        patchImport({ status: "error", error: { message: problem, issues: [], canTruncate: false } });
        return false;
      }
      const pending = session().import;
      if (pending.status === "review" && pending.result && !resultNeedsMapping(pending.result)) {
        const ok = (await deps.confirm({ title: "Ya tienes una importación sin confirmar.", message: "Se reemplazará por el archivo nuevo.", confirmLabel: "Usar el archivo nuevo", destructive: true })).confirmed;
        if (!ok) return false;
      }
      patchImport({ ...initialImport(), mode: pending.mode, strategy: pending.strategy, includeRejected: pending.includeRejected });
      return run(file, {});
    },

    /** Vuelve a enviar el mismo archivo con las columnas que la persona eligió. */
    async applyColumnMapping(columns: Record<string, FieldKey | null>): Promise<boolean> {
      const file = runtime.importSource.file;
      const sheet = session().import.result?.sheetName;
      if (!file) {
        notify({ message: "Vuelve a seleccionar el archivo para aplicar el mapeo de columnas", severity: "warning", group: "import" });
        return false;
      }
      return run(file, { columns, ...(sheet ? { sheet } : {}) });
    },

    /** «Importar solo las primeras N filas» tras TOO_MANY_ROWS: acción explícita, queda registrada en el resumen. */
    async importFirstRows(limit: number): Promise<boolean> {
      const file = runtime.importSource.file;
      if (!file) return false;
      return run(file, { truncateTo: limit });
    },

    cancelUpload(): void {
      controller?.abort();
      patchImport({ status: "idle" });
    },

    setStrategy(strategy: DuplicateStrategy): void {
      const { result, mode, decisions } = session().import;
      const fresh = strategy === "review" && result && Object.keys(decisions).length === 0 ? reviewDecisions(result, mode) : decisions;
      patchImport({ strategy, decisions: fresh });
    },
    setDecision(row: number, decision: DuplicateDecision): void {
      patchImport({ decisions: { ...session().import.decisions, [row]: decision } });
    },
    setMode(mode: ImportSession["mode"]): void {
      const { result, strategy } = session().import;
      patchImport({ mode, decisions: strategy === "review" && result ? reviewDecisions(result, mode) : {} });
    },
    setIncludeRejected: (includeRejected: boolean) => patchImport({ includeRejected }),

    /** Cambia la clave de duplicados: los grupos cambian, así que las decisiones por fila se reinician. */
    changeDuplicateKey(config: DuplicateKeyConfig): void {
      updateProject(runtime.project, (p) => setDuplicateKey(p, config));
      const { result, mode, strategy } = session().import;
      patchImport({ decisions: strategy === "review" && result ? reviewDecisions(result, mode) : {} });
    },

    /** Confirma: crea las piezas, guarda el resultado y lanza la resolución de QR en lote. */
    async confirm(): Promise<boolean> {
      const current = currentPlan();
      const importState = session().import;
      if (!current || importState.status !== "review" || resultNeedsMapping(current.result)) return false;
      const { result, plan } = current;
      if (planSize(plan) === 0) {
        notify({ message: "No hay piezas para importar con esta selección", severity: "info", group: "import" });
        return false;
      }

      const existing = orderedRecords(project()).length;
      if (importState.mode === "replace" && existing > 0 && isDirty(project())) {
        const ok = (await deps.confirm({ title: "Tienes cambios sin guardar.", message: `Se reemplazarán las ${existing} piezas actuales.`, confirmLabel: "Reemplazar sin guardar", destructive: true })).confirmed;
        if (!ok) return false;
      }
      if (importState.mode === "replace") runtime.inflight.abortAll();

      const items: ImportItem[] = [...plan.toCreate.map(({ row, duplicateOf }) => itemOf(row, duplicateOf)), ...plan.fixes.map(fixItemOf)].sort((a, b) => a.row - b.row);
      let createdIds: RecordId[] = [];
      updateProject(runtime.project, (p) => {
        const out = importRecords(p, items, { now: now(), fileName: result.fileName, mode: importState.mode });
        createdIds = out.created;
        return out.state;
      });

      const outcome = { created: plan.toCreate.length, discarded: plan.discarded.length, fixes: plan.fixes.length, discardedRows: plan.discarded.map((d) => d.row.row) };
      patchImport({ status: "done", outcome });
      void runtime.lastImport.save({ result, outcome });
      patchSession(runtime.session, (s) => ({ selection: { ...s.selection, currentId: createdIds[0] ?? s.selection.currentId, page: 1 }, filter: "all", query: "" }));

      const errors = result.rejected.length - plan.fixes.length;
      const extras = [
        errors > 0 ? plural(errors, "error", "errores") : "",
        outcome.discarded > 0 ? plural(outcome.discarded, "duplicado no importado", "duplicados no importados") : "",
        plan.fixes.length > 0 ? plural(plan.fixes.length, "pieza a corregir", "piezas a corregir") : "",
      ].filter(Boolean);
      notify({
        message: extras.length === 0 ? `Excel importado: ${plural(outcome.created, "pieza válida", "piezas válidas")}` : `Excel importado: ${plural(outcome.created, "pieza", "piezas")} · ${extras.join(" · ")}`,
        severity: extras.length === 0 ? "success" : "warning",
        group: "import",
      });

      // QR en lote: solo las piezas sin errores propios (las que tienen error se corrigen a mano).
      const state = project();
      const pending = createdIds.filter((id) => {
        const record = state.recordsById[id];
        return record !== undefined && !record.qrError && !record.validationErrors.some((issue) => issue.severity === "error");
      });
      if (pending.length > 0) void deps.resolve(pending);
      deps.goToPieces?.();
      return true;
    },

    /** Quita el resultado guardado (las filas con error dejan de estar disponibles). */
    async discardResult(): Promise<boolean> {
      const { status, result } = session().import;
      if (status === "review" && result && (result.rejected.length > 0 || validRows(result).length > 0)) {
        const ok = (await deps.confirm({ title: "¿Descartar esta importación?", message: "Todavía no se creó ninguna pieza con este archivo y se perderá la lista de filas con error.", confirmLabel: "Descartar", destructive: true })).confirmed;
        if (!ok) return false;
      }
      controller?.abort();
      runtime.importSource.file = null;
      runtime.importSource.defaultMenuUrl = "";
      patchSession(runtime.session, { import: initialImport() });
      await runtime.lastImport.clear();
      return true;
    },

    /** Informe CSV de las filas rechazadas y de los duplicados que no se importan. */
    downloadErrorReport(): void {
      const { result, outcome } = session().import;
      if (!result) return;
      const discardedRows = new Set(outcome ? outcome.discardedRows : (currentPlan()?.plan.discarded ?? []).map((d) => d.row.row));
      const duplicates = validRows(result)
        .filter((r) => discardedRows.has(r.row))
        .map((r) => ({ row: r.row, values: { ...r.draft }, reason: "Duplicado no importado" }));
      const base = result.fileName.replace(/\.xlsx$/i, "") || "importacion";
      deps.download(`errores-${base}.csv`, new Blob([buildErrorReport(result.rejected, duplicates)], { type: "text/csv;charset=utf-8" }));
    },
  };
  return actions;
}

export type ImportActions = ReturnType<typeof createImportActions>;
