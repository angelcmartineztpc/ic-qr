/**
 * Caso de uso del cliente: resolver los QR de las piezas (spec §36).
 *   sin Link del QR → generar (o reutilizar) en el servidor
 *   con Link del QR → verificar ESE recurso; jamás se genera
 * Los resultados se aplican solo si la pieza no cambió desde que se pidió.
 */
import { resolveQrDecision } from "@/lib/records/qr-state";
import type { ProjectState, QrResolution, RecordId } from "@/types";

import { ApiError, type ResolveFetcher, type ResolveRequestBody } from "./api-client";
import type { QrInflight } from "./qr-inflight";
import { applyResolutions, markQrFailure, type SentSnapshot } from "@/lib/state/project";

export interface ResolveQrDeps {
  fetchResolve: ResolveFetcher;
  getState(): ProjectState;
  update(transform: (state: ProjectState) => ProjectState): void;
  inflight: QrInflight;
  now(): string;
  onProgress?(progress: { done: number; total: number }): void;
  chunkSize?: number;
}

export interface ResolveQrSummary {
  generated: number;
  reused: number;
  verified: number;
  failed: number;
  /** Resultados descartados porque la pieza cambió mientras se resolvía. */
  discarded: number;
  /** Piezas que no se resolvieron porque ya estaban en curso o tienen errores de datos. */
  skipped: number;
  cancelled: boolean;
  /** Mensaje del primer fallo de red o de servidor (429, 401…), si lo hubo. */
  networkError?: string;
}

const EMPTY: ResolveQrSummary = { generated: 0, reused: 0, verified: 0, failed: 0, discarded: 0, skipped: 0, cancelled: false };

/** ¿Qué hay que pedirle al servidor para esta pieza? (null = nada) */
function planFor(state: ProjectState, id: RecordId): { kind: "generate" | "verify"; revision: number } | null {
  const record = state.recordsById[id];
  if (!record) return null;
  const decision = resolveQrDecision(record);
  if (decision !== "generate" && decision !== "check-existing") return null;
  // Datos inválidos: ya se ven como error en la pieza; no se pide nada que el servidor rechazaría.
  // (Un Mesa vacío no impide el QR: depende solo del Link del menú.)
  if (record.validationErrors.some((e) => e.severity === "error" && (e.field === "menuUrl" || e.field === "qrUrl"))) return null;
  return { kind: decision === "generate" ? "generate" : "verify", revision: state.revision };
}

export async function resolveQrs(ids: readonly RecordId[], deps: ResolveQrDeps): Promise<ResolveQrSummary> {
  const summary: ResolveQrSummary = { ...EMPTY };
  const chunkSize = deps.chunkSize ?? 50;
  const state = deps.getState();

  const jobs = ids.flatMap((id) => {
    const plan = planFor(state, id);
    if (!plan || deps.inflight.isBusy(id)) {
      summary.skipped++;
      return [];
    }
    return [{ id, ...plan }];
  });

  let done = 0;
  deps.onProgress?.({ done, total: jobs.length });

  for (let start = 0; start < jobs.length; start += chunkSize) {
    const chunk = jobs.slice(start, start + chunkSize);
    const controller = new AbortController();
    const begun = chunk.filter((job) => deps.inflight.begin(job.id, controller));
    if (begun.length === 0) continue;

    const current = deps.getState();
    const sent = new Map<RecordId, SentSnapshot>();
    const body: ResolveRequestBody = {};
    for (const job of begun) {
      const record = current.recordsById[job.id];
      if (!record) continue;
      sent.set(job.id, { menuUrl: record.menuUrl, qrUrl: record.qrUrl });
      if (job.kind === "generate") (body.items ??= []).push({ recordId: job.id, menuUrl: record.menuUrl, expectedRevision: job.revision });
      else if (record.qrUrl !== undefined) (body.verify ??= []).push({ recordId: job.id, qrUrl: record.qrUrl, menuUrl: record.menuUrl });
    }

    try {
      const response = await deps.fetchResolve(body, controller.signal);
      const valid: QrResolution[] = response.results.filter((r) => sent.has(r.recordId) && !deps.inflight.wasCancelled(r.recordId));
      summary.discarded += response.results.length - valid.length;
      let outcome = { applied: [] as RecordId[], discarded: [] as RecordId[] };
      deps.update((s) => {
        const applied = applyResolutions(s, valid, sent, deps.now());
        outcome = applied;
        return applied.state;
      });
      summary.discarded += outcome.discarded.length;
      for (const result of valid) {
        if (!outcome.applied.includes(result.recordId)) continue;
        if (result.outcome === "generated") summary.generated++;
        else if (result.outcome === "reused") summary.reused++;
        else if (result.outcome === "existing-ok") summary.verified++;
        else summary.failed++;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        summary.cancelled = true;
      } else {
        const message = error instanceof ApiError ? error.message : "No se pudo contactar con el servidor";
        summary.networkError ??= message;
        const stillWanted = begun.filter((job) => !deps.inflight.wasCancelled(job.id)).map((job) => job.id);
        deps.update((s) => markQrFailure(s, stillWanted, { code: "unreachable", message }, deps.now()));
        summary.failed += stillWanted.length;
      }
    } finally {
      for (const job of begun) deps.inflight.end(job.id);
    }
    done += chunk.length;
    deps.onProgress?.({ done, total: jobs.length });
    if (summary.cancelled) break;
  }
  return summary;
}
