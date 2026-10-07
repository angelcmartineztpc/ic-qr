/**
 * Acciones del builder: orquestan el estado, el servidor, las confirmaciones y
 * las notificaciones. Es una fábrica sin React para poder probar cada flujo
 * (spec §22, §37, §38: nada silencioso y confirmación antes de perder datos).
 */
import { resolveQrs, type ResolveQrSummary } from "@/lib/app/resolve-qrs";
import { tileInputOf } from "@/lib/app/tile-preview-client";
import { sanitizeFileName } from "@/lib/export/file-name";
import { findExistingDuplicate } from "@/lib/records/duplicates";
import { isExportable, resolveQrDecision, qrBlocker } from "@/lib/records/qr-state";
import type { SortKey } from "@/lib/records/order";
import { PROJECT_FILE_MAX_BYTES } from "@/schemas/project";
import { projectFileName, parseProjectFile, serializeProjectFile } from "@/lib/state/project-file";
import {
  acknowledge,
  addRecord,
  changeTemplate,
  clearQrError,
  clearQuarantine,
  createEmptyProject,
  deleteRecords,
  duplicateRecordIn,
  isDirty,
  markSaved,
  moveRecord,
  orderedRecords,
  regenerate,
  restoreRecords,
  setProjectName,
  sortRecords,
  updateRecord,
} from "@/lib/state/project";
import type { Runtime } from "@/lib/state/StoreProvider";
import { patchSession, updateProject } from "@/lib/state/stores";
import { getTemplate } from "@/templates";
import type { QRRecord, RecordDraft, RecordId } from "@/types";

import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";

export interface ActionDeps {
  runtime: Pick<Runtime, "project" | "session" | "inflight" | "fetchResolve" | "tiles" | "readBackup">;
  notify(options: NotifyOptions): void;
  confirm(options: ConfirmOptions): Promise<ConfirmResult>;
  now(): string;
  download(fileName: string, blob: Blob): void;
}

const SORT_LABELS: Record<SortKey, string> = { area: "Área", estacion: "Estación", mesa: "Mesa", sourceRow: "fila de Excel" };
const label = (r: QRRecord) => [r.mesa, r.area].filter(Boolean).join(" · ") || "sin nombre";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function createBuilderActions(deps: ActionDeps) {
  const { runtime, notify, now } = deps;
  const project = () => runtime.project.getState().project;
  const session = () => runtime.session.getState();
  const update = (transform: Parameters<typeof updateProject>[1]) => updateProject(runtime.project, transform);
  const confirm = async (options: ConfirmOptions) => (await deps.confirm(options)).confirmed;

  const unsavedGuard = async (message: string, confirmLabel: string): Promise<boolean> => {
    if (!isDirty(project()) || orderedRecords(project()).length === 0) return true;
    return confirm({ title: "Tienes cambios sin guardar.", message, confirmLabel, destructive: true });
  };

  /** Deja seleccionada una pieza y la página de la tira que la contiene. */
  function select(id: RecordId | null): void {
    const { order } = project();
    const index = id === null ? -1 : order.indexOf(id);
    patchSession(runtime.session, (s) => ({
      selection: { ...s.selection, currentId: index >= 0 ? id : (order[0] ?? null), page: index >= 0 ? Math.floor(index / s.selection.pageSize) + 1 : s.selection.page },
    }));
  }

  function announce(summary: ResolveQrSummary, retry: () => void): void {
    const parts: string[] = [];
    if (summary.generated > 0) parts.push(plural(summary.generated, "QR generado", "QR generados"));
    if (summary.reused > 0) parts.push(plural(summary.reused, "QR reutilizado (ya existía)", "QR reutilizados (ya existían)"));
    if (summary.verified > 0) parts.push(plural(summary.verified, "QR existente verificado", "QR existentes verificados"));
    if (summary.failed > 0) {
      const detail = summary.networkError ? `: ${summary.networkError}` : "";
      notify({ message: `${parts.length > 0 ? `${parts.join(" · ")} · ` : ""}No se pudo obtener el QR de ${plural(summary.failed, "pieza", "piezas")}${detail}`, severity: "error", group: "qr-batch", action: { label: "Reintentar", onClick: retry } });
    } else if (parts.length > 0) {
      notify({ message: parts.join(" · "), severity: "success", group: "qr-batch" });
    }
  }

  async function resolve(ids: readonly RecordId[]): Promise<ResolveQrSummary> {
    patchSession(runtime.session, { qrProgress: { running: true, done: 0, total: ids.length } });
    const summary = await resolveQrs(ids, {
      fetchResolve: runtime.fetchResolve,
      getState: project,
      update,
      inflight: runtime.inflight,
      now,
      onProgress: ({ done, total }) => patchSession(runtime.session, { qrProgress: { running: done < total, done, total } }),
    });
    patchSession(runtime.session, { qrProgress: { running: false, done: 0, total: 0 } });
    if (summary.cancelled) notify({ message: "Generación de QR cancelada", severity: "info", group: "qr-batch" });
    else announce(summary, () => void retryFailed(ids));
    return summary;
  }

  async function retryFailed(ids: readonly RecordId[]): Promise<void> {
    for (const id of ids) update((p) => clearQrError(p, id, now()));
    await resolve(ids);
  }

  const actions = {
    select,
    resolve,

    /** Pendientes de generar o verificar (botón «Generar QR pendientes»). */
    pendingIds(): RecordId[] {
      const p = project();
      return orderedRecords(p).filter((r) => (resolveQrDecision(r) === "generate" || resolveQrDecision(r) === "check-existing") && !runtimeBusy(r.id)).map((r) => r.id);
    },
    async generatePending(): Promise<ResolveQrSummary | null> {
      const ids = actions.pendingIds();
      if (ids.length === 0) {
        notify({ message: "No hay QR pendientes", severity: "info", group: "qr-batch" });
        return null;
      }
      return resolve(ids);
    },
    cancelQr(): void {
      runtime.inflight.abortAll();
    },

    /** Alta de una pieza (spec §4A). El QR se resuelve al guardar. */
    async add(draft: RecordDraft): Promise<QRRecord> {
      const afterId = session().selection.currentId ?? undefined;
      const duplicate = findExistingDuplicate(draft, Object.values(project().recordsById), project().duplicateKey);
      let created!: QRRecord;
      update((p) => {
        const out = addRecord(p, draft, now(), afterId ? { afterId } : {});
        created = out.record;
        return out.state;
      });
      select(created.id);
      notify({ message: duplicate ? `Pieza agregada. Ya había una igual: ${label(duplicate)}` : `Pieza agregada: ${label(created)}`, severity: duplicate ? "warning" : "success", group: "records" });
      void resolve([created.id]);
      return created;
    },

    /** Edición. Devuelve false si la persona cancela una confirmación. */
    async save(id: RecordId, draft: RecordDraft): Promise<boolean> {
      const current = project().recordsById[id];
      if (!current) return false;

      if (current.qr.source === "existing" && current.qrUrl !== undefined && draft.qrUrl === undefined) {
        const ok = await confirm({ title: "¿Vaciar el Link del QR?", message: "Se generará un QR nuevo para esta pieza.", confirmLabel: "Vaciar y generar", destructive: true });
        if (!ok) return false;
      } else if (current.qr.source === "generated" && draft.qrUrl !== undefined && draft.qrUrl !== current.qrUrl) {
        const ok = await confirm({ title: "¿Usar tu propio QR?", message: "Esta pieza usará el QR del link que escribiste en lugar del que generó la aplicación.", confirmLabel: "Usar mi QR" });
        if (!ok) return false;
      }

      if (draft.menuUrl !== current.menuUrl || draft.qrUrl !== current.qrUrl) runtime.inflight.invalidate(id);
      update((p) => updateRecord(p, id, draft, now()));
      const next = project().recordsById[id];
      if (next?.qrStatus === "stale" && current.qrStatus !== "stale") {
        notify({ message: `Cambiaste el Link del menú de ${label(next)}: su QR quedó desactualizado`, severity: "warning", group: "records", action: { label: "Regenerar", onClick: () => void actions.regenerate(id) } });
      } else {
        notify({ message: `Pieza actualizada: ${next ? label(next) : label(current)}`, severity: "success", group: "records" });
      }
      void resolve([id]);
      return true;
    },

    /** Borrado con confirmación (spec §38) y [Deshacer]. */
    async remove(ids: readonly RecordId[]): Promise<boolean> {
      const records = ids.flatMap((id) => (project().recordsById[id] ? [project().recordsById[id] as QRRecord] : []));
      if (records.length === 0) return false;
      const single = records.length === 1;
      const askAnyway = !single || session().confirmDeletes;
      if (askAnyway) {
        const result = await deps.confirm({
          title: single ? `¿Eliminar la pieza ${label(records[0] as QRRecord)}?` : `¿Eliminar ${records.length} piezas?`,
          ...(single ? {} : { message: "Puedes deshacerlo." }),
          confirmLabel: single ? "Eliminar" : `Eliminar ${records.length} piezas`,
          destructive: true,
          ...(single ? { checkboxLabel: "No volver a preguntar en esta sesión" } : {}),
        });
        if (!result.confirmed) return false;
        if (single && result.checked) patchSession(runtime.session, { confirmDeletes: false });
      }

      let removed!: ReturnType<typeof deleteRecords>["removed"];
      for (const record of records) runtime.inflight.invalidate(record.id);
      update((p) => {
        const out = deleteRecords(p, ids);
        removed = out.removed;
        return out.state;
      });
      const gone = new Set(ids);
      patchSession(runtime.session, (s) => ({ lastDeleted: removed, excluded: s.excluded.filter((id) => !gone.has(id)) }));
      select(session().selection.currentId && !gone.has(session().selection.currentId as string) ? session().selection.currentId : null);
      notify({ message: single ? "Pieza eliminada" : `${records.length} piezas eliminadas`, severity: "info", group: "records", action: { label: "Deshacer", onClick: () => actions.undoDelete() } });
      return true;
    },

    undoDelete(): void {
      const removed = session().lastDeleted;
      if (!removed) return;
      update((p) => restoreRecords(p, removed));
      patchSession(runtime.session, { lastDeleted: null });
      const first = removed.records[0];
      if (first) select(first.id);
      notify({ message: removed.records.length === 1 ? "Pieza restaurada" : `${removed.records.length} piezas restauradas`, severity: "success", group: "records" });
    },

    duplicate(id: RecordId): QRRecord | null {
      let copy: QRRecord | null = null;
      update((p) => {
        const out = duplicateRecordIn(p, id, now());
        copy = out?.record ?? null;
        return out?.state ?? p;
      });
      if (!copy) return null;
      select((copy as QRRecord).id);
      notify({ message: `Pieza duplicada: ${label(copy)}`, severity: "success", group: "records" });
      return copy;
    },

    move(id: RecordId, index: number): void {
      update((p) => moveRecord(p, id, index));
      select(id);
    },

    async sortBy(key: SortKey): Promise<boolean> {
      if (orderedRecords(project()).length < 2) return false;
      const ok = await confirm({ title: `¿Ordenar por ${SORT_LABELS[key]}?`, message: `Cambiará el orden de las ${orderedRecords(project()).length} piezas (también en el PDF).`, confirmLabel: "Ordenar" });
      if (!ok) return false;
      update((p) => sortRecords(p, key));
      patchSession(runtime.session, { sortKey: key });
      notify({ message: `Piezas ordenadas por ${SORT_LABELS[key]}`, severity: "success", group: "records" });
      return true;
    },

    // ----- acciones sobre el QR de una pieza -----
    async regenerate(id: RecordId): Promise<void> {
      runtime.inflight.invalidate(id);
      update((p) => regenerate(p, id, now()));
      await resolve([id]);
    },
    keepStale(id: RecordId): void {
      update((p) => acknowledge(p, id, "stale", now()));
      notify({ message: "Se mantendrá el QR anterior para esta pieza", severity: "info", group: "records" });
    },
    useAnyway(id: RecordId): void {
      const record = project().recordsById[id];
      if (!record) return;
      const kind = qrBlocker(record) === "existing-undecodable" ? "undecodable" : "mismatch";
      update((p) => acknowledge(p, id, kind, now()));
      notify({ message: "Se usará el QR existente tal cual (confirmado)", severity: "info", group: "records" });
    },
    async retry(id: RecordId): Promise<void> {
      update((p) => clearQrError(p, id, now()));
      await resolve([id]);
    },
    async verify(id: RecordId): Promise<void> {
      await resolve([id]);
    },
    /** Sustituir un QR existente por uno generado: acción explícita, con confirmación. */
    async replaceWithGenerated(id: RecordId): Promise<boolean> {
      const record = project().recordsById[id];
      if (!record) return false;
      const ok = await confirm({ title: "¿Reemplazar el QR existente?", message: "Se quitará el Link del QR y la aplicación generará un QR nuevo con el Link del menú.", confirmLabel: "Reemplazar", destructive: true });
      if (!ok) return false;
      runtime.inflight.invalidate(id);
      update((p) => updateRecord(p, id, { area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl }, now()));
      await resolve([id]);
      return true;
    },

    // ----- descargas sueltas -----
    /**
     * «Descargar SVG de esta pieza» (spec §17). El SVG sale del servidor, con el texto en
     * contornos de Gotham (la fuente nunca llega al navegador, decisión R2): es el mismo que
     * muestra la vista previa. Solo se ofrece para piezas exportables: el SVG de una pieza
     * con QR pendiente, con error o sin confirmar no debe llegar a fabricación por descuido.
     */
    async downloadPieceSvg(id: RecordId): Promise<boolean> {
      const record = project().recordsById[id];
      if (!record) return false;
      if (!isExportable(record)) {
        notify({ message: `Resuelve el QR y los errores de ${label(record)} antes de descargar su SVG`, severity: "warning", group: "export" });
        return false;
      }
      const p = project();
      try {
        const tile = await runtime.tiles.request({ templateId: p.templateId, templateOverrides: p.templateOverrides, layout: p.layout, detail: "full" }, tileInputOf(record));
        const name = `${sanitizeFileName(`${record.mesa}-${record.area}`) || "pieza"}.svg`;
        deps.download(name, new Blob([tile.svg], { type: "image/svg+xml" }));
        notify(
          tile.warnings.length > 0
            ? { message: `SVG descargado (${name}) con ${plural(tile.warnings.length, "aviso", "avisos")} de composición: revisa la pieza`, severity: "warning", group: "export" }
            : { message: `SVG descargado: ${name}`, severity: "success", group: "export" },
        );
        return true;
      } catch (error) {
        notify({ message: `No se pudo generar el SVG: ${error instanceof Error ? error.message : "error desconocido"}`, severity: "error", group: "export" });
        return false;
      }
    },

    /** Registros que no se pudieron leer al abrir: se conservan y se pueden descargar (nunca se pierden en silencio). */
    downloadQuarantine(): void {
      const entries = project().quarantine;
      if (entries.length === 0) return;
      deps.download("registros-ilegibles.json", new Blob([JSON.stringify({ format: "qr-production-quarantine", exportedAt: now(), entries }, null, 2)], { type: "application/json" }));
      notify({ message: `Descargado${entries.length === 1 ? "" : "s"} ${plural(entries.length, "registro ilegible", "registros ilegibles")}`, severity: "info", group: "persistence" });
    },

    /** Descartar la cuarentena: acción explícita y con confirmación (se pierde su contenido). */
    async discardQuarantine(): Promise<boolean> {
      const count = project().quarantine.length;
      if (count === 0) return false;
      const ok = await confirm({ title: `¿Descartar ${plural(count, "registro ilegible", "registros ilegibles")}?`, message: "Se eliminarán del proyecto. Descárgalos antes si quieres conservarlos.", confirmLabel: "Descartar", destructive: true });
      if (!ok) return false;
      update(clearQuarantine);
      notify({ message: `${plural(count, "registro ilegible descartado", "registros ilegibles descartados")}`, severity: "info", group: "persistence" });
      return true;
    },

    /** Copia de seguridad del proyecto guardado que no se pudo leer. */
    async downloadBackup(key: string): Promise<boolean> {
      const raw = await runtime.readBackup(key).catch(() => undefined);
      if (raw === undefined) {
        notify({ message: "No se encontró la copia de seguridad en este navegador", severity: "error", group: "persistence" });
        return false;
      }
      deps.download(`copia-${sanitizeFileName(key)}.json`, new Blob([JSON.stringify(raw)], { type: "application/json" }));
      notify({ message: "Copia de seguridad descargada", severity: "success", group: "persistence" });
      return true;
    },

    // ----- proyecto -----
    setName(name: string): void {
      update((p) => setProjectName(p, name));
    },
    async switchTemplate(templateId: string): Promise<boolean> {
      const template = getTemplate(templateId);
      if (!template || template.id === project().templateId) return false;
      const lost = Object.keys(project().layout.overrides).length;
      if (lost > 0 && !(await confirm({ title: "¿Cambiar de plantilla?", message: `Se perderán ${plural(lost, "posición personalizada", "posiciones personalizadas")}.`, confirmLabel: "Cambiar plantilla", destructive: true }))) return false;
      update((p) => changeTemplate(p, template));
      runtime.tiles.clear();
      notify({ message: `Plantilla: ${template.name}`, severity: "success", group: "records" });
      return true;
    },
    saveProjectFile(): void {
      const p = project();
      const name = projectFileName(p);
      deps.download(name, new Blob([serializeProjectFile(p, now())], { type: "application/json" }));
      update((s) => markSaved(s, now()));
      notify({ message: `Proyecto guardado (${name})`, severity: "success", group: "persistence" });
    },
    async openProjectFile(text: string): Promise<boolean> {
      if (!(await unsavedGuard("Se reemplazará el proyecto actual por el del archivo.", "Abrir sin guardar"))) return false;
      const opened = parseProjectFile(text, now());
      if (!opened.ok) {
        notify({ message: opened.message, severity: "error", group: "persistence" });
        return false;
      }
      runtime.project.setState({ project: opened.project });
      runtime.tiles.clear();
      patchSession(runtime.session, { lastDeleted: null, excluded: [], filter: "all", query: "", selection: { ...session().selection, currentId: opened.project.order[0] ?? null, page: 1 } });
      const { summary } = opened;
      const notes = [plural(summary.records, "pieza abierta", "piezas abiertas")];
      if (summary.acksCleared > 0) notes.push(`${plural(summary.acksCleared, "pieza necesita", "piezas necesitan")} confirmar de nuevo su QR`);
      if (summary.quarantined > 0) notes.push(`${plural(summary.quarantined, "registro no se pudo leer", "registros no se pudieron leer")}`);
      notify({ message: notes.join(" · "), severity: summary.acksCleared + summary.quarantined > 0 ? "warning" : "success", group: "persistence" });
      return true;
    },
    /** Abre un archivo elegido por la persona: comprueba el tamaño ANTES de leerlo en memoria. */
    async openProjectFromFile(file: { size: number; text(): Promise<string> }): Promise<boolean> {
      if (file.size > PROJECT_FILE_MAX_BYTES) {
        notify({ message: "El archivo es demasiado grande (máximo 20 MB)", severity: "error", group: "persistence" });
        return false;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        notify({ message: "No se pudo leer el archivo", severity: "error", group: "persistence" });
        return false;
      }
      return actions.openProjectFile(text);
    },
    async newProject(): Promise<boolean> {
      const count = orderedRecords(project()).length;
      if (!(await unsavedGuard(`Se perderán ${plural(count, "pieza", "piezas")}.`, "Empezar sin guardar"))) return false;
      runtime.inflight.abortAll();
      runtime.project.setState({ project: createEmptyProject(now()) });
      runtime.tiles.clear();
      patchSession(runtime.session, { lastDeleted: null, excluded: [], filter: "all", query: "", notices: { restored: null, quarantined: 0, recoveredBackup: null }, selection: { ...session().selection, currentId: null, page: 1 } });
      return true;
    },
  };

  const runtimeBusy = (id: RecordId) => runtime.inflight.isBusy(id);
  return actions;
}

export type BuilderActions = ReturnType<typeof createBuilderActions>;
