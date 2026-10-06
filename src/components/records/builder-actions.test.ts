import { describe, expect, it } from "vitest";

import type { ResolveFetcher, ResolveResponse } from "@/lib/app/api-client";
import { QrInflight } from "@/lib/app/qr-inflight";
import { TilePreviewClient } from "@/lib/app/tile-preview-client";
import { createEmptyProject, isDirty, orderedRecords } from "@/lib/state/project";
import { createProjectStore, createSessionStore } from "@/lib/state/stores";
import type { NotifyOptions } from "@/components/ui/NotificationsProvider";
import type { ConfirmOptions, ConfirmResult } from "@/components/ui/ConfirmDialog";
import type { QrResolution } from "@/types";

import { draft, existingSource, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { createBuilderActions } from "./builder-actions";

function setup(options: { confirm?: (o: ConfirmOptions) => ConfirmResult; fetchResolve?: ResolveFetcher } = {}) {
  const project = createProjectStore(createEmptyProject(NOW, { id: "p" }));
  const session = createSessionStore({ hydrated: true });
  const notifications: NotifyOptions[] = [];
  const confirms: ConfirmOptions[] = [];
  const downloads: Array<{ name: string; blob: Blob }> = [];
  const requests: unknown[] = [];

  const fetchResolve: ResolveFetcher =
    options.fetchResolve ??
    (async (body) => {
      requests.push(body);
      const results: QrResolution[] = [
        ...(body.items ?? []).map((i): QrResolution => ({ recordId: i.recordId, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(i.menuUrl) })),
        ...(body.verify ?? []).map((v): QrResolution => ({ recordId: v.recordId, outcome: "existing-ok", qr: existingSource({ decodedPayload: v.menuUrl }) })),
      ];
      return { results, created: body.items?.length ?? 0, reused: 0, failed: 0 } satisfies ResolveResponse;
    });

  const actions = createBuilderActions({
    runtime: { project, session, inflight: new QrInflight(), fetchResolve, tiles: new TilePreviewClient(async () => ({ tiles: {} })) },
    notify: (n) => notifications.push(n),
    confirm: async (o) => (confirms.push(o), options.confirm ? options.confirm(o) : { confirmed: true, checked: false }),
    now: () => LATER,
    download: (name, blob) => downloads.push({ name, blob }),
  });
  return { actions, project, session, notifications, confirms, downloads, requests, state: () => project.getState().project, ui: () => session.getState() };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

describe("alta de piezas (AC1, AC2, AC11)", () => {
  it("agrega una pieza, la selecciona y genera su QR al guardar", async () => {
    const t = setup();
    const record = await t.actions.add(draft({ mesa: "M1" }));
    await flush();
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1"]);
    expect(t.ui().selection.currentId).toBe(record.id);
    expect(t.state().recordsById[record.id]).toMatchObject({ qrStatus: "generated" });
    expect(isDirty(t.state())).toBe(true);
    expect(t.notifications.map((n) => n.message)).toEqual(expect.arrayContaining(["Pieza agregada: M1 · Tropical", "1 QR generado"]));
  });

  it("varias piezas, una tras otra, cada una a continuación de la seleccionada", async () => {
    const t = setup();
    for (const mesa of ["M1", "M2", "M3"]) await t.actions.add(draft({ mesa, menuUrl: `${MENU}?${mesa}` }));
    await flush();
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1", "M2", "M3"]);
  });

  it("con Link del QR solo se verifica; no se pide generar (AC12)", async () => {
    const t = setup();
    const record = await t.actions.add(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }));
    await flush();
    expect(t.requests).toEqual([{ verify: [{ recordId: record.id, qrUrl: "https://qr.cliente.com/m1.svg", menuUrl: MENU }] }]);
    expect(t.state().recordsById[record.id]).toMatchObject({ qrStatus: "existing", qr: { source: "existing", verification: "decoded" } });
  });

  it("avisa (sin bloquear) si ya hay una pieza igual", async () => {
    const t = setup();
    await t.actions.add(draft());
    await t.actions.add(draft());
    expect(t.notifications.some((n) => n.severity === "warning" && /Ya había una igual/.test(n.message))).toBe(true);
    expect(orderedRecords(t.state())).toHaveLength(2);
  });

  it("si el servidor falla, el error queda visible y se puede reintentar", async () => {
    let fail = true;
    const t = setup({ fetchResolve: async () => (fail ? Promise.reject(new TypeError("Failed to fetch")) : { results: [], created: 0, reused: 0, failed: 0 }) });
    const record = await t.actions.add(draft());
    await flush();
    expect(t.state().recordsById[record.id]).toMatchObject({ qrStatus: "error", qrError: { code: "unreachable" } });
    const error = t.notifications.find((n) => n.severity === "error");
    expect(error?.message).toMatch(/No se pudo obtener el QR de 1 pieza/);
    expect(error?.action?.label).toBe("Reintentar");
    fail = false;
    error?.action?.onClick();
    await flush();
    expect(t.state().recordsById[record.id]?.qrError).toBeUndefined();
  });
});

describe("edición (AC4)", () => {
  it("guardar cambios actualiza la pieza y avisa", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft({ mesa: "M1" }));
    await flush();
    expect(await t.actions.save(id, draft({ mesa: "M7" }))).toBe(true);
    expect(t.state().recordsById[id]?.mesa).toBe("M7");
    expect(last(t.notifications)?.message).toMatch(/^Pieza actualizada|1 QR/);
  });

  it("cambiar el Link del menú de una pieza con QR generado la deja desactualizada y ofrece Regenerar (sin regenerar sola)", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft());
    await flush();
    const before = t.requests.length;
    await t.actions.save(id, draft({ menuUrl: "https://menu.example.com/nuevo" }));
    await flush();
    expect(t.state().recordsById[id]?.qrStatus).toBe("stale");
    expect(t.requests.length).toBe(before); // no se pidió ningún QR nuevo
    const warning = t.notifications.find((n) => n.severity === "warning" && /desactualizado/.test(n.message));
    expect(warning?.action?.label).toBe("Regenerar");
    warning?.action?.onClick();
    await flush();
    expect(t.state().recordsById[id]).toMatchObject({ qrStatus: "generated", qr: { payload: "https://menu.example.com/nuevo" } });
  });

  it("vaciar el Link del QR de una pieza con QR existente pide confirmación; cancelar no cambia nada", async () => {
    const t = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    const { id } = await t.actions.add(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }));
    await flush();
    expect(await t.actions.save(id, draft())).toBe(false);
    expect(t.confirms[0]).toMatchObject({ title: "¿Vaciar el Link del QR?", message: "Se generará un QR nuevo para esta pieza.", confirmLabel: "Vaciar y generar" });
    expect(t.state().recordsById[id]?.qrUrl).toBe("https://qr.cliente.com/m1.svg");
  });

  it("confirmado, se genera un QR nuevo", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }));
    await flush();
    expect(await t.actions.save(id, draft())).toBe(true);
    await flush();
    expect(t.state().recordsById[id]).toMatchObject({ qrStatus: "generated", qr: { source: "generated" } });
    expect(t.state().recordsById[id]?.qrUrl).toContain("/qr/v1/");
  });

  it("escribir un QR propio en una pieza con QR generado también pide confirmación", async () => {
    const t = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    const { id } = await t.actions.add(draft());
    await flush();
    expect(await t.actions.save(id, draft({ qrUrl: "https://qr.cliente.com/propio.svg" }))).toBe(false);
    expect(t.state().recordsById[id]?.qr.source).toBe("generated");
  });
});

describe("eliminar con confirmación y deshacer (AC3, spec §38)", () => {
  async function three() {
    const t = setup({ confirm: (o) => ({ confirmed: true, checked: !!o.checkboxLabel && false }) });
    for (const mesa of ["M1", "M2", "M3"]) await t.actions.add(draft({ mesa, menuUrl: `${MENU}?${mesa}` }));
    await flush();
    return t;
  }

  it("SIEMPRE pregunta antes de borrar; cancelar no borra nada", async () => {
    const t = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    const { id } = await t.actions.add(draft());
    expect(await t.actions.remove([id])).toBe(false);
    expect(t.confirms[0]).toMatchObject({ title: "¿Eliminar la pieza M1 · Tropical?", destructive: true, checkboxLabel: "No volver a preguntar en esta sesión" });
    expect(orderedRecords(t.state())).toHaveLength(1);
  });

  it("borrar quita la pieza, deja un aviso con [Deshacer] y deshacer la devuelve a su sitio", async () => {
    const t = await three();
    const [, m2] = t.state().order;
    expect(await t.actions.remove([m2 as string])).toBe(true);
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1", "M3"]);
    const notice = last(t.notifications);
    expect(notice).toMatchObject({ message: "Pieza eliminada", action: { label: "Deshacer" } });
    notice?.action?.onClick();
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1", "M2", "M3"]);
    expect(t.ui().lastDeleted).toBeNull();
  });

  it("borrado masivo: «¿Eliminar N piezas?» + «Puedes deshacerlo.»", async () => {
    const t = await three();
    await t.actions.remove(t.state().order.slice(0, 2));
    expect(last(t.confirms)).toMatchObject({ title: "¿Eliminar 2 piezas?", message: "Puedes deshacerlo.", confirmLabel: "Eliminar 2 piezas" });
    expect(last(t.notifications)?.message).toBe("2 piezas eliminadas");
  });

  it("«No volver a preguntar en esta sesión» solo afecta al borrado individual", async () => {
    const t = setup({ confirm: () => ({ confirmed: true, checked: true }) });
    const a = await t.actions.add(draft({ mesa: "M1" }));
    const b = await t.actions.add(draft({ mesa: "M2", menuUrl: `${MENU}?2` }));
    const c = await t.actions.add(draft({ mesa: "M3", menuUrl: `${MENU}?3` }));
    await t.actions.remove([a.id]);
    expect(t.ui().confirmDeletes).toBe(false);
    const asked = t.confirms.length;
    await t.actions.remove([b.id]); // individual: ya no pregunta
    expect(t.confirms.length).toBe(asked);
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M3"]);
    await t.actions.add(draft({ mesa: "M4", menuUrl: `${MENU}?4` }));
    await t.actions.remove([c.id, t.state().order[1] as string]); // masivo: sí pregunta
    expect(t.confirms.length).toBe(asked + 1);
  });

  it("al borrar la pieza seleccionada se selecciona otra", async () => {
    const t = await three();
    const first = t.state().order[0] as string;
    t.actions.select(first);
    await t.actions.remove([first]);
    expect(t.ui().selection.currentId).toBe(t.state().order[0]);
  });
});

describe("duplicar, mover y ordenar (AC23)", () => {
  it("duplicar crea una copia con el mismo QR, sin pedir otro", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft());
    await flush();
    const requests = t.requests.length;
    const copy = t.actions.duplicate(id);
    expect(copy?.metadata).toMatchObject({ origin: "duplicate", duplicateOf: id });
    expect(copy?.qr).toEqual(t.state().recordsById[id]?.qr);
    expect(t.requests.length).toBe(requests);
  });

  it("mover pieza a una posición y ordenar con confirmación", async () => {
    const t = setup();
    for (const mesa of ["M10", "M2", "M1"]) await t.actions.add(draft({ mesa, menuUrl: `${MENU}?${mesa}` }));
    await flush();
    t.actions.move(t.state().order[2] as string, 0);
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1", "M10", "M2"]);
    expect(await t.actions.sortBy("mesa")).toBe(true);
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M1", "M2", "M10"]); // orden natural
    expect(last(t.confirms)).toMatchObject({ title: "¿Ordenar por Mesa?" });
  });

  it("cancelar el orden no cambia nada", async () => {
    const t = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    for (const mesa of ["M2", "M1"]) await t.actions.add(draft({ mesa, menuUrl: `${MENU}?${mesa}` }));
    expect(await t.actions.sortBy("mesa")).toBe(false);
    expect(orderedRecords(t.state()).map((r) => r.mesa)).toEqual(["M2", "M1"]);
  });
});

describe("generar los QR pendientes", () => {
  it("resuelve todas las piezas pendientes de golpe; sin pendientes lo dice", async () => {
    const t = setup({ fetchResolve: async () => ({ results: [], created: 0, reused: 0, failed: 0 }) });
    await t.actions.add(draft({ mesa: "M1" }));
    await t.actions.add(draft({ mesa: "M2", menuUrl: `${MENU}?2` }));
    await flush();
    expect(t.actions.pendingIds()).toHaveLength(2);
    const ok = setup();
    await ok.actions.add(draft());
    await flush();
    expect(await ok.actions.generatePending()).toBeNull();
    expect(last(ok.notifications)?.message).toBe("No hay QR pendientes");
  });
});

describe("acciones sobre el QR de una pieza", () => {
  it("mantener el QR anterior desbloquea la pieza stale (confirmación ligada)", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft());
    await flush();
    await t.actions.save(id, draft({ menuUrl: "https://menu.example.com/nuevo" }));
    expect(t.state().recordsById[id]?.qrStatus).toBe("stale");
    t.actions.keepStale(id);
    expect(t.state().recordsById[id]?.qrAck).toMatchObject({ kind: "stale", menuUrl: "https://menu.example.com/nuevo" });
  });

  it("«Usar de todos modos» confirma el desajuste o la ilegibilidad según el caso", async () => {
    const t = setup({ fetchResolve: async (body) => ({ results: (body.verify ?? []).map((v): QrResolution => ({ recordId: v.recordId, outcome: "existing-ok", qr: existingSource({ decodedPayload: "https://otra.example.com" }) })), created: 0, reused: 0, failed: 0 }) });
    const { id } = await t.actions.add(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }));
    await flush();
    expect(t.state().recordsById[id]?.qrStatus).toBe("existing");
    t.actions.useAnyway(id);
    expect(t.state().recordsById[id]?.qrAck?.kind).toBe("mismatch");
  });

  it("reemplazar un QR existente por uno generado es explícito y pide confirmación", async () => {
    const t = setup();
    const { id } = await t.actions.add(draft({ qrUrl: "https://qr.cliente.com/m1.svg" }));
    await flush();
    expect(await t.actions.replaceWithGenerated(id)).toBe(true);
    await flush();
    expect(last(t.confirms)).toMatchObject({ title: "¿Reemplazar el QR existente?" });
    expect(t.state().recordsById[id]).toMatchObject({ qr: { source: "generated" } });
  });
});

describe("proyecto: guardar, abrir, nuevo (spec §38)", () => {
  it("guardar descarga el .qrproj.json, deja el proyecto sin cambios pendientes y avisa", async () => {
    const t = setup();
    t.actions.setName("Tropical Mesas 2026");
    await t.actions.add(draft());
    await flush();
    expect(isDirty(t.state())).toBe(true);
    t.actions.saveProjectFile();
    expect(t.downloads[0]?.name).toBe("Tropical Mesas 2026.qrproj.json");
    expect(isDirty(t.state())).toBe(false);
    expect(last(t.notifications)).toMatchObject({ message: "Proyecto guardado (Tropical Mesas 2026.qrproj.json)", severity: "success" });
  });

  it("abrir lo guardado restaura todo sin regenerar ningún QR", async () => {
    const source = setup();
    await source.actions.add(draft());
    await flush();
    source.actions.saveProjectFile();
    const text = await source.downloads[0]!.blob.text();

    const target = setup();
    expect(await target.actions.openProjectFile(text)).toBe(true);
    expect(orderedRecords(target.state())).toHaveLength(1);
    expect(orderedRecords(target.state())[0]).toMatchObject({ qrStatus: "generated" });
    expect(target.requests).toHaveLength(0); // ninguna petición de QR
    expect(isDirty(target.state())).toBe(false);
  });

  it("abrir un archivo inválido muestra el error y no toca el proyecto", async () => {
    const t = setup();
    await t.actions.add(draft());
    expect(await t.actions.openProjectFile("esto no es un proyecto")).toBe(false);
    expect(last(t.notifications)).toMatchObject({ severity: "error" });
    expect(orderedRecords(t.state())).toHaveLength(1);
  });

  it("con cambios sin guardar pregunta «Tienes cambios sin guardar.» antes de abrir o empezar de nuevo; cancelar conserva todo", async () => {
    const t = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    await t.actions.add(draft());
    expect(await t.actions.newProject()).toBe(false);
    expect(last(t.confirms)).toMatchObject({ title: "Tienes cambios sin guardar.", message: "Se perderán 1 pieza.", confirmLabel: "Empezar sin guardar", destructive: true });
    expect(await t.actions.openProjectFile("{}")).toBe(false);
    expect(last(t.confirms)).toMatchObject({ confirmLabel: "Abrir sin guardar" });
    expect(orderedRecords(t.state())).toHaveLength(1);
  });

  it("sin cambios pendientes no molesta; confirmado, empieza un proyecto vacío", async () => {
    const t = setup();
    await t.actions.add(draft());
    t.actions.saveProjectFile();
    const asked = t.confirms.length;
    expect(await t.actions.newProject()).toBe(true);
    expect(t.confirms.length).toBe(asked);
    expect(orderedRecords(t.state())).toHaveLength(0);
    expect(t.ui().selection.currentId).toBeNull();
  });

  it("cambiar de plantilla confirma si se pierden posiciones personalizadas", async () => {
    const t = setup();
    expect(await t.actions.switchTemplate("restaurant-default")).toBe(true);
    expect(t.state().templateId).toBe("restaurant-default");
    expect(await t.actions.switchTemplate("restaurant-default")).toBe(false);
    expect(await t.actions.switchTemplate("no-existe")).toBe(false);
    const { id } = await t.actions.add(draft());
    t.project.setState({ project: { ...t.state(), layout: { ...t.state().layout, overrides: { [id]: {} } } } });
    const picky = setup({ confirm: () => ({ confirmed: false, checked: false }) });
    picky.project.setState({ project: { ...picky.state(), layout: { ...picky.state().layout, overrides: { x: {} } } } });
    expect(await picky.actions.switchTemplate("restaurant-default")).toBe(false);
    expect(last(picky.confirms)).toMatchObject({ message: "Se perderán 1 posición personalizada." });
  });
});

describe("cancelar la generación", () => {
  it("aborta lo que está en curso y lo comunica", async () => {
    const t = setup({ fetchResolve: (_b, signal) => new Promise<ResolveResponse>((_r, reject) => signal.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")))) });
    const run = t.actions.add(draft());
    await run;
    await flush();
    t.actions.cancelQr();
    await flush();
    expect(last(t.notifications)).toMatchObject({ message: "Generación de QR cancelada", severity: "info" });
    expect(t.ui().qrProgress.running).toBe(false);
  });
});
