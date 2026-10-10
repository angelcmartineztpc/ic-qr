import { describe, expect, it } from "vitest";

import { ExportCancelledError, ExportClientError, type ExportResult } from "@/lib/export/client";
import { QrInflight } from "@/lib/app/qr-inflight";
import { addRecord, applyResolutions, createEmptyProject, isDirty, markSaved, setLayoutBox } from "@/lib/state/project";
import { createProjectStore, createSessionStore } from "@/lib/state/stores";
import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";
import type { QrResolution, RecordId } from "@/types";

import { draft, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { createExportActions } from "./export-actions";

const resolution = (id: string, menuUrl: string): QrResolution => ({ recordId: id, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(menuUrl) });
const result = (over: Partial<ExportResult> = {}): ExportResult => ({ files: { pdf: { name: "Mesas.pdf", mime: "application/pdf", blob: new Blob(["pdf"]) } }, done: { pages: 1, pieces: 2, warnings: 0 }, warnings: [], ...over });

function setup(options: { pending?: string[]; runJob?: (...args: never[]) => Promise<ExportResult>; confirm?: (o: ConfirmOptions) => ConfirmResult; resolveFixes?: boolean } = {}) {
  let p = createEmptyProject(NOW, { id: "p" });
  const sent = new Map<string, { menuUrl: string }>();
  const resolved: QrResolution[] = [];
  for (const id of ["a", "b", "c"]) {
    const menuUrl = `${MENU}?m=${id}`;
    p = addRecord(p, draft({ mesa: id.toUpperCase(), menuUrl }), NOW, { id }).state;
    if (!(options.pending ?? []).includes(id)) {
      sent.set(id, { menuUrl });
      resolved.push(resolution(id, menuUrl));
    }
  }
  p = markSaved(applyResolutions(p, resolved, sent, LATER).state, LATER);
  const project = createProjectStore(p);
  const session = createSessionStore({ hydrated: true });
  const notifications: NotifyOptions[] = [];
  const downloads: Array<{ name: string; blob: Blob }> = [];
  const requests: Array<{ records: Array<{ id: string }> }> = [];
  const resolveCalls: RecordId[][] = [];
  const fixes: RecordId[] = [];
  const confirms: ConfirmOptions[] = [];
  const inflight = new QrInflight();
  const actions = createExportActions({
    runtime: { project, session, inflight },
    notify: (n) => notifications.push(n),
    confirm: async (o) => (confirms.push(o), options.confirm ? options.confirm(o) : { confirmed: true, checked: false }),
    now: () => new Date(2026, 9, 8, 14, 5),
    download: (name, blob) => downloads.push({ name, blob }),
    resolve: async (ids) => {
      resolveCalls.push([...ids]);
      if (options.resolveFixes) {
        const map = new Map(ids.map((id) => [id, { menuUrl: project.getState().project.recordsById[id]?.menuUrl ?? "" }]));
        project.setState({ project: applyResolutions(project.getState().project, ids.map((id) => resolution(id, map.get(id)?.menuUrl ?? "")), map, LATER).state });
      }
    },
    goToFix: (id) => fixes.push(id),
    runJob: (async (request: { records: Array<{ id: string }> }, callbacks: { onPhase?: (p: unknown) => void }, signal?: AbortSignal) => {
      requests.push(request);
      callbacks.onPhase?.({ phase: "generating", done: 1, total: 3 });
      callbacks.onPhase?.({ phase: "preparing", done: 3, total: 3 });
      callbacks.onPhase?.({ phase: "downloading", bytes: 10, size: 20, file: "pdf" });
      if (options.runJob) return (options.runJob as (r: unknown, c: unknown, s?: AbortSignal) => Promise<ExportResult>)(request, callbacks, signal);
      return result();
    }) as never,
  });
  return { actions, project, session, notifications, downloads, requests, resolveCalls, fixes, confirms, inflight, last: () => notifications.at(-1), state: () => project.getState().project, gen: () => session.getState().generation };
}

describe("generar y descargar", () => {
  it("camino feliz: pide todas las piezas, descarga el PDF, deja el proyecto como guardado y avisa", async () => {
    const t = setup();
    t.project.setState({ project: { ...t.state(), revision: t.state().revision + 1 } }); // cambios sin exportar
    expect(isDirty(t.state())).toBe(true);
    expect(await t.actions.start()).toBe(true);
    expect(t.requests[0]?.records.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(t.downloads.map((d) => d.name)).toEqual(["Mesas.pdf"]);
    expect(isDirty(t.state())).toBe(false); // savedRevision al terminar
    expect(t.last()).toMatchObject({ message: "PDF descargado correctamente", severity: "success", group: "export" });
    expect(t.gen()).toMatchObject({ phase: "done", result: { pieces: 2, pages: 1, warnings: 0, zip: null } });
  });

  it("las fases reales llegan al estado (generando → preparando → descargando)", async () => {
    const seen: string[] = [];
    const t = setup({
      runJob: async () => {
        seen.push(t.gen().phase);
        return result();
      },
    });
    const unsubscribe = t.session.subscribe((s) => seen.push(s.generation.phase));
    await t.actions.start();
    unsubscribe();
    expect([...new Set(seen)]).toEqual(expect.arrayContaining(["generating", "preparing", "downloading", "done"]));
    expect(seen.indexOf("generating")).toBeLessThan(seen.indexOf("preparing"));
    expect(seen.indexOf("preparing")).toBeLessThan(seen.indexOf("downloading"));
  });

  it("con avisos de composición, el aviso lo dice; con ZIP, ofrece «Descargar ZIP»", async () => {
    const t = setup({ runJob: async () => result({ done: { pages: 1, pieces: 3, warnings: 2 }, files: { pdf: { name: "M.pdf", mime: "application/pdf", blob: new Blob(["p"]) }, zip: { name: "M.zip", mime: "application/zip", blob: new Blob(["z"]) } } }) });
    await t.actions.start();
    expect(t.last()).toMatchObject({ severity: "warning", message: expect.stringContaining("2 avisos de composición") as never, action: { label: "Descargar ZIP" } });
    expect(t.downloads.map((d) => d.name)).toEqual(["M.pdf"]); // el ZIP no se baja solo
    t.last()?.action?.onClick();
    expect(t.downloads.map((d) => d.name)).toEqual(["M.pdf", "M.zip"]);
    t.actions.downloadZip();
    expect(t.downloads.at(-1)?.name).toBe("M.zip");
  });

  it("solo ZIP: se descarga el ZIP directamente", async () => {
    const t = setup({ runJob: async () => result({ files: { zip: { name: "Solo.zip", mime: "application/zip", blob: new Blob(["z"]) } } }) });
    await t.actions.start();
    expect(t.downloads.map((d) => d.name)).toEqual(["Solo.zip"]);
  });

  it("sin piezas que exportar no llama al servidor", async () => {
    const t = setup();
    t.session.setState((s) => ({ ...s, excluded: ["a", "b", "c"] }));
    expect(await t.actions.start()).toBe(false);
    expect(t.requests).toHaveLength(0);
    expect(t.last()?.message).toBe("No hay piezas para exportar");
  });

  it("no se puede lanzar dos veces a la vez", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = setup({ runJob: async () => (await gate, result()) });
    const first = t.actions.start();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(await t.actions.start()).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(t.requests).toHaveLength(1);
  });
});

describe("QR pendientes y bloqueos (§1.2-22)", () => {
  it("antes de exportar resuelve en lote los QR pendientes y luego exporta todas", async () => {
    const t = setup({ pending: ["b"], resolveFixes: true });
    expect(await t.actions.start()).toBe(true);
    expect(t.resolveCalls).toEqual([["b"]]);
    expect(t.requests[0]?.records.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("si tras resolver siguen bloqueando, no exporta: lista las piezas con su motivo y avisa", async () => {
    const t = setup({ pending: ["b"] });
    expect(await t.actions.start()).toBe(false);
    expect(t.requests).toHaveLength(0);
    expect(t.session.getState().exportReview).toEqual({ blocked: [{ recordId: "b", reason: "Falta generar el QR" }] });
    expect(t.gen().phase).toBe("idle");
  });

  it("[Excluir N piezas]: no viajan, el resto se exporta numerado 1…n y la exclusión queda visible", async () => {
    const t = setup({ pending: ["b"] });
    await t.actions.start();
    await t.actions.excludeBlocked();
    expect(t.session.getState().excluded).toEqual(["b"]);
    expect(t.requests[0]?.records.map((r) => r.id)).toEqual(["a", "c"]);
    expect(t.session.getState().exportReview).toBeNull();
    t.actions.includeAll();
    expect(t.session.getState().excluded).toEqual([]);
  });

  it("[Ir a corregir] lleva a la primera pieza que bloquea y cierra el diálogo", async () => {
    const t = setup({ pending: ["b", "c"] });
    await t.actions.start();
    t.actions.fixBlocked();
    expect(t.fixes).toEqual(["b"]);
    expect(t.session.getState().exportReview).toBeNull();
  });

  it("cerrar el diálogo no cambia nada", async () => {
    const t = setup({ pending: ["b"] });
    await t.actions.start();
    t.actions.dismissReview();
    expect(t.session.getState().exportReview).toBeNull();
    expect(t.session.getState().excluded).toEqual([]);
  });

  it("exportar con el QR solapado con el texto pide confirmación; si se rechaza no se exporta", async () => {
    const overlap = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    overlap.project.setState({ project: setLayoutBox(overlap.state(), "qr", { x: 10, y: 5, width: 25, height: 25 }, { kind: "all" }) });
    expect(await overlap.actions.start()).toBe(false);
    expect(overlap.confirms[0]).toMatchObject({ title: "El QR se solapa con el texto en 3 piezas.", confirmLabel: "Generar de todos modos" });
    expect(overlap.requests).toHaveLength(0);
    expect(overlap.gen().phase).toBe("idle");

    const accepted = setup();
    accepted.project.setState({ project: setLayoutBox(accepted.state(), "qr", { x: 10, y: 5, width: 25, height: 25 }, { kind: "all" }) });
    expect(await accepted.actions.start()).toBe(true);
  });

  it("sin solapes no pregunta nada", async () => {
    const t = setup();
    await t.actions.start();
    expect(t.confirms).toHaveLength(0);
  });
});

describe("errores y cancelación", () => {
  const failing = (error: unknown) => setup({ runJob: async () => Promise.reject(error) });

  it("«La descarga se interrumpió» con [Reintentar], que vuelve a pedir la exportación", async () => {
    const t = failing(new ExportClientError("STREAM_TRUNCATED", "La descarga se interrumpió"));
    expect(await t.actions.start()).toBe(false);
    expect(t.last()).toMatchObject({ message: "La descarga se interrumpió", severity: "error", action: { label: "Reintentar" } });
    expect(t.gen().phase).toBe("error");
    t.last()?.action?.onClick();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.requests).toHaveLength(2);
  });

  it("sin conexión: mensaje útil con [Reintentar]", async () => {
    const t = failing(new ExportClientError("NETWORK", "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."));
    await t.actions.start();
    expect(t.last()).toMatchObject({ severity: "error", message: expect.stringContaining("Revisa tu conexión") as never, action: { label: "Reintentar" } });
  });

  it("el servidor dice qué piezas bloquean (400): se muestran en el diálogo y el aviso las cuenta", async () => {
    const t = failing(new ExportClientError("NOT_VALID", "x", [{ recordId: "a", message: "QR desactualizado (stale) sin confirmar" }, { recordId: "c", message: "QR no resuelto" }]));
    await t.actions.start();
    expect(t.session.getState().exportReview?.blocked.map((b) => b.recordId)).toEqual(["a", "c"]);
    expect(t.gen().phase).toBe("idle");
  });

  it("identidad del QR o instantánea perdida: «Error al generar el PDF (pieza): motivo»", async () => {
    const t = failing(new ExportClientError("QR_IDENTITY_MISMATCH", "El hash del QR no corresponde a su contenido", [], "b"));
    await t.actions.start();
    expect(t.last()).toMatchObject({ severity: "error", message: "Error al generar el PDF (B · Tropical): El hash del QR no corresponde a su contenido" });
    expect(t.session.getState().exportReview?.blocked[0]?.recordId).toBe("b");
  });

  it("límite de solicitudes y servidor ocupado: aviso (no error) con el tiempo de espera del servidor", async () => {
    const t = failing(new ExportClientError("RATE_LIMITED", "Demasiadas solicitudes; vuelve a intentarlo en 5 s"));
    await t.actions.start();
    expect(t.last()).toMatchObject({ severity: "warning", message: "Demasiadas solicitudes; vuelve a intentarlo en 5 s" });
  });

  it("tiempo máximo y errores genéricos: mensaje del servidor / «Error al generar el PDF: …»", async () => {
    const timeout = failing(new ExportClientError("EXPORT_TIMEOUT", "La exportación tardó demasiado y se canceló"));
    await timeout.actions.start();
    expect(timeout.last()?.message).toBe("La exportación tardó demasiado y se canceló");
    const generic = failing(new ExportClientError("SERVER", "Error interno. Referencia: abc"));
    await generic.actions.start();
    expect(generic.last()?.message).toBe("Error al generar el PDF: Error interno. Referencia: abc");
    const unknown = failing(new Error("boom"));
    await unknown.actions.start();
    expect(unknown.last()?.message).toBe("Error al generar el PDF: boom");
  });

  it("cancelar aborta la petición, muestra «Descarga cancelada» y no descarga nada", async () => {
    const t = setup({
      runJob: (async (_r: unknown, _c: unknown, signal?: AbortSignal) =>
        new Promise<ExportResult>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new ExportCancelledError())))) as never,
    });
    const run = t.actions.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.gen().phase).toBe("downloading");
    t.actions.cancel();
    expect(await run).toBe(false);
    expect(t.last()).toMatchObject({ message: "Descarga cancelada", severity: "info", group: "export" });
    expect(t.gen().phase).toBe("idle");
    expect(t.downloads).toHaveLength(0);
  });

  it("cancelar mientras se resuelven los QR detiene esa resolución y no exporta", async () => {
    const t = setup({ pending: ["b"] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const actions = createExportActions({
      runtime: { project: t.project, session: t.session, inflight: t.inflight },
      notify: (n) => t.notifications.push(n),
      confirm: async () => ({ confirmed: true, checked: false }),
      now: () => new Date(),
      download: () => undefined,
      resolve: async () => void (await gate),
      runJob: (async () => result()) as never,
    });
    const run = actions.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.gen().phase).toBe("resolving");
    actions.cancel();
    release();
    expect(await run).toBe(false);
    expect(t.last()?.message).toBe("Descarga cancelada");
    expect(t.gen().phase).toBe("idle");
  });
});
