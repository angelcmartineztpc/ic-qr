import { describe, expect, it } from "vitest";

import { addRecord, createEmptyProject, updateRecord, type ProjectState } from "@/lib/state/project";
import type { QrResolution } from "@/types";

import { draft, existingSource, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { ApiError, type ResolveFetcher, type ResolveRequestBody, type ResolveResponse } from "./api-client";
import { QrInflight } from "./qr-inflight";
import { resolveQrs, type ResolveQrDeps } from "./resolve-qrs";

/** Un «cliente» mínimo: un estado, un registro de trabajos y un servidor falso. */
function harness(seed: (s: ProjectState) => ProjectState = (s) => s) {
  let state = seed(createEmptyProject(NOW, { id: "p" }));
  const inflight = new QrInflight();
  const requests: ResolveRequestBody[] = [];
  let respond: ResolveFetcher = async (body) => answer(body);

  const answer = (body: ResolveRequestBody): ResolveResponse => {
    const results: QrResolution[] = [
      ...(body.items ?? []).map((i): QrResolution => ({ recordId: i.recordId, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(i.menuUrl) })),
      ...(body.verify ?? []).map((v): QrResolution => ({ recordId: v.recordId, outcome: "existing-ok", qr: existingSource({ decodedPayload: v.menuUrl }) })),
    ];
    return { results, created: body.items?.length ?? 0, reused: 0, failed: 0 };
  };

  const deps = (overrides: Partial<ResolveQrDeps> = {}): ResolveQrDeps => ({
    fetchResolve: (body, signal) => (requests.push(body), respond(body, signal)),
    getState: () => state,
    update: (f) => void (state = f(state)),
    inflight,
    now: () => LATER,
    ...overrides,
  });
  return { get state() { return state; }, set state(s: ProjectState) { state = s; }, inflight, requests, deps, answer, setRespond: (f: ResolveFetcher) => void (respond = f) };
}

const add = (s: ProjectState, id: string, d = draft({ menuUrl: `${MENU}?${id}` })) => addRecord(s, d, NOW, { id }).state;

describe("resolveQrs — qué se pide al servidor", () => {
  it("sin Link del QR → items (generar); con Link del QR → verify (nunca generar)", async () => {
    const h = harness((s) => add(add(s, "sin"), "con", draft({ menuUrl: `${MENU}?con`, qrUrl: "https://qr.cliente.com/c.svg" })));
    const summary = await resolveQrs(["sin", "con"], h.deps());
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.items?.map((i) => i.recordId)).toEqual(["sin"]);
    expect(h.requests[0]?.verify).toEqual([{ recordId: "con", qrUrl: "https://qr.cliente.com/c.svg", menuUrl: `${MENU}?con` }]);
    expect(summary).toMatchObject({ generated: 1, verified: 1, failed: 0, discarded: 0 });
    expect(h.state.recordsById["sin"]).toMatchObject({ qrStatus: "generated" });
    expect(h.state.recordsById["con"]).toMatchObject({ qrStatus: "existing", qr: { verification: "decoded" } });
  });

  it("una pieza que ya tiene QR generado no se vuelve a pedir (reabrir o re-guardar no genera nada)", async () => {
    const h = harness((s) => add(s, "a"));
    await resolveQrs(["a"], h.deps());
    expect(h.requests).toHaveLength(1);
    const again = await resolveQrs(["a"], h.deps());
    expect(h.requests).toHaveLength(1); // ninguna petición nueva
    expect(again.skipped).toBe(1);
  });

  it("no pide piezas con el Link del menú inválido (ya se ven con error) pero sí con otros errores", async () => {
    const h = harness((s) => add(add(s, "bad", draft({ menuUrl: "hola" })), "sin-mesa", draft({ mesa: "", menuUrl: `${MENU}?x` })));
    const summary = await resolveQrs(["bad", "sin-mesa"], h.deps());
    expect(h.requests[0]?.items?.map((i) => i.recordId)).toEqual(["sin-mesa"]);
    expect(summary.skipped).toBe(1);
  });

  it("ids desconocidos se ignoran; si no hay nada que pedir no se llama al servidor", async () => {
    const h = harness();
    const summary = await resolveQrs(["nope"], h.deps());
    expect(h.requests).toHaveLength(0);
    expect(summary.skipped).toBe(1);
  });

  it("agrupa en lotes y avisa del progreso", async () => {
    const h = harness((s) => Array.from({ length: 5 }, (_, i) => `r${i}`).reduce((acc, id) => add(acc, id), s));
    const progress: Array<[number, number]> = [];
    await resolveQrs(["r0", "r1", "r2", "r3", "r4"], h.deps({ chunkSize: 2, onProgress: (p) => progress.push([p.done, p.total]) }));
    expect(h.requests.map((r) => r.items?.length)).toEqual([2, 2, 1]);
    expect(progress).toEqual([[0, 5], [2, 5], [4, 5], [5, 5]]);
  });
});

describe("resolveQrs — carreras (guarda de aplicación)", () => {
  it("si se edita el Link del menú mientras se genera, el resultado se descarta y no aparece un 'stale' falso", async () => {
    const h = harness((s) => add(s, "a"));
    h.setRespond(async (body) => {
      // El usuario edita la pieza mientras el servidor trabaja.
      h.state = updateRecord(h.state, "a", draft({ menuUrl: "https://menu.example.com/otro" }), LATER);
      h.inflight.invalidate("a");
      return {
        results: (body.items ?? []).map((i): QrResolution => ({ recordId: i.recordId, outcome: "generated", qrUrl: "https://cdn.example.com/q.svg", qr: generatedSource(i.menuUrl) })),
        created: 1, reused: 0, failed: 0,
      };
    });
    const summary = await resolveQrs(["a"], h.deps());
    expect(summary).toMatchObject({ generated: 0, discarded: 1 });
    expect(h.state.recordsById["a"]).toMatchObject({ qrStatus: "pending", menuUrl: "https://menu.example.com/otro" });
  });

  it("si se teclea un Link del QR mientras se genera, no se sobrescribe con uno generado", async () => {
    const h = harness((s) => add(s, "a"));
    h.setRespond(async (body) => {
      h.state = updateRecord(h.state, "a", draft({ menuUrl: `${MENU}?a`, qrUrl: "https://qr.cliente.com/a.svg" }), LATER);
      return h.answer(body);
    });
    const summary = await resolveQrs(["a"], h.deps());
    expect(summary.discarded).toBe(1);
    expect(h.state.recordsById["a"]).toMatchObject({ qr: { source: "existing" }, qrUrl: "https://qr.cliente.com/a.svg" });
  });

  it("un segundo disparo para una pieza en vuelo se ignora (doble clic)", async () => {
    const h = harness((s) => add(s, "a"));
    let release: (() => void) | undefined;
    h.setRespond((body) => new Promise<ResolveResponse>((resolve) => (release = () => resolve(h.answer(body)))));
    const first = resolveQrs(["a"], h.deps());
    await Promise.resolve();
    expect(h.inflight.ids()).toEqual(["a"]);
    const second = await resolveQrs(["a"], h.deps());
    expect(second.skipped).toBe(1);
    expect(h.requests).toHaveLength(1);
    release?.();
    expect((await first).generated).toBe(1);
    expect(h.inflight.ids()).toEqual([]);
  });

  it("se pueden resolver otras piezas mientras una está en vuelo", async () => {
    const h = harness((s) => add(add(s, "a"), "b"));
    let release: (() => void) | undefined;
    h.setRespond((body) => (body.items?.[0]?.recordId === "a" ? new Promise<ResolveResponse>((resolve) => (release = () => resolve(h.answer(body)))) : Promise.resolve(h.answer(body))));
    const first = resolveQrs(["a"], h.deps());
    await Promise.resolve();
    expect((await resolveQrs(["b"], h.deps())).generated).toBe(1);
    release?.();
    await first;
    expect(h.state.recordsById["a"]?.qrStatus).toBe("generated");
  });
});

describe("resolveQrs — fallos (nada silencioso)", () => {
  it("un fallo de red deja el error visible en cada pieza y no genera nada", async () => {
    const h = harness((s) => add(add(s, "a"), "b"));
    h.setRespond(async () => Promise.reject(new TypeError("Failed to fetch")));
    const summary = await resolveQrs(["a", "b"], h.deps());
    expect(summary).toMatchObject({ failed: 2, networkError: "No se pudo contactar con el servidor" });
    expect(h.state.recordsById["a"]).toMatchObject({ qrStatus: "error", qrError: { code: "unreachable" } });
    expect(h.inflight.ids()).toEqual([]);
  });

  it("un error del servidor (429, 401…) se muestra con su mensaje", async () => {
    const h = harness((s) => add(s, "a"));
    h.setRespond(async () => Promise.reject(new ApiError(429, "RATE_LIMITED", "Demasiadas solicitudes; vuelve a intentarlo en 12 s")));
    const summary = await resolveQrs(["a"], h.deps());
    expect(summary.networkError).toMatch(/12 s/);
    expect(h.state.recordsById["a"]?.qrError?.message).toMatch(/12 s/);
  });

  it("un fallo por pieza del servidor (p. ej. conflicto de storage) se aplica a esa pieza", async () => {
    const h = harness((s) => add(add(s, "a"), "b"));
    h.setRespond(async (body) => ({
      results: (body.items ?? []).map((i): QrResolution => (i.recordId === "a" ? { recordId: "a", outcome: "failed", error: { code: "storage-conflict", message: "Hay un archivo distinto" } } : { recordId: i.recordId, outcome: "generated", qrUrl: "https://cdn.example.com/q.svg", qr: generatedSource(i.menuUrl) })),
      created: 1, reused: 0, failed: 1,
    }));
    const summary = await resolveQrs(["a", "b"], h.deps());
    expect(summary).toMatchObject({ generated: 1, failed: 1 });
    expect(h.state.recordsById["a"]).toMatchObject({ qrStatus: "error", qrError: { code: "storage-conflict" } });
    expect(h.state.recordsById["b"]?.qrStatus).toBe("generated");
  });

  it("cancelar aborta la petición en curso y deja las piezas como estaban (sin error)", async () => {
    const h = harness((s) => add(s, "a"));
    h.setRespond((_body, signal) => new Promise<ResolveResponse>((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")))));
    const run = resolveQrs(["a"], h.deps());
    await Promise.resolve();
    h.inflight.abortAll();
    const summary = await run;
    expect(summary.cancelled).toBe(true);
    expect(h.state.recordsById["a"]).toMatchObject({ qrStatus: "pending" });
    expect(h.state.recordsById["a"]?.qrError).toBeUndefined();
  });

  it("verificar un QR existente que falla deja el error y NUNCA lo reemplaza por uno generado", async () => {
    const h = harness((s) => add(s, "c", draft({ menuUrl: `${MENU}?c`, qrUrl: "https://qr.cliente.com/c.png" })));
    h.setRespond(async () => ({ results: [{ recordId: "c", outcome: "failed", error: { code: "raster-only", message: "Es una imagen" } }], created: 0, reused: 0, failed: 1 }));
    await resolveQrs(["c"], h.deps());
    expect(h.state.recordsById["c"]).toMatchObject({ qrStatus: "error", qr: { source: "existing" }, qrUrl: "https://qr.cliente.com/c.png", qrError: { code: "raster-only" } });
    expect(h.requests.every((r) => r.items === undefined)).toBe(true);
  });
});

describe("QrInflight", () => {
  it("notifica a la interfaz los cambios", () => {
    const inflight = new QrInflight();
    const seen: string[][] = [];
    const off = inflight.subscribe((ids) => seen.push(ids));
    expect(inflight.begin("a", new AbortController())).toBe(true);
    expect(inflight.begin("a", new AbortController())).toBe(false);
    inflight.end("a");
    off();
    inflight.begin("b", new AbortController());
    expect(seen).toEqual([["a"], []]);
  });
});
