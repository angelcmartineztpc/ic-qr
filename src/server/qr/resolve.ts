import "server-only";

import { encodeMatrix, MAX_PAYLOAD_LENGTH } from "@/lib/qr/encode";
import { qrStorageKey } from "@/lib/qr/hash-input";
import { renderQrSvg } from "@/lib/qr/render-svg";
import { QR_RENDERER_VERSION } from "@/lib/qr/version";
import { QrResolveItemSchema } from "@/schemas/api";
import { MenuUrlSchema } from "@/schemas/url";
import type { GeneratedQrSource, QrErrorCode, QrResolution, StorageProvider } from "@/types";

import { StorageError } from "../storage/keys";
import { mapWithConcurrency } from "../util/limiter";
import { contentHashOf, sha256Hex } from "./hash";
import type { HourlyQuota } from "./quota";

export interface ResolveDeps {
  storage: StorageProvider;
  keyPrefix: string;
  quota: HourlyQuota;
  now: () => Date;
  /** Concurrencia por llamada (la global la impone el storage). */
  concurrency?: number;
}

export interface ResolveSummary {
  results: QrResolution[];
  /** Archivos nuevos creados en el storage. */
  created: number;
  /** Piezas cuyo QR ya existía (reutilizado, sin escribir nada). */
  reused: number;
  failed: number;
}

type Failure = { code: QrErrorCode; message: string };
type AssetOutcome = { ok: true; created: boolean } | { ok: false; error: Failure };

interface Job {
  key: string;
  payload: string;
  contentHash: string;
  svg: string;
  svgSha256: string;
}

const failed = (recordId: string, code: QrErrorCode, message: string): QrResolution => ({ recordId, outcome: "failed", error: { code, message } });

/**
 * Parsea un ítem de generación. REGLA CRÍTICA (defensa en profundidad): un ítem
 * que traiga `qrUrl` o `qr` es un registro con Link del QR y NUNCA se genera
 * para él, aunque el cliente lo pida.
 */
function parseItem(raw: unknown): { ok: true; recordId: string; menuUrl: string } | { ok: false; recordId: string; error: Failure } {
  const object = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const recordId = typeof object.recordId === "string" && object.recordId ? object.recordId.slice(0, 64) : "(sin id)";
  if ("qrUrl" in object || "qr" in object) {
    return { ok: false, recordId, error: { code: "unsafe-url", message: "Este registro tiene Link del QR: se usa ese recurso y no se genera un QR nuevo" } };
  }
  const parsed = QrResolveItemSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, recordId, error: { code: "encode-failed", message: "Petición de QR no válida" } };
  const menu = MenuUrlSchema.safeParse(parsed.data.menuUrl);
  if (!menu.success) return { ok: false, recordId, error: { code: "encode-failed", message: "El Link del menú no es una URL válida" } };
  if (menu.data.length > MAX_PAYLOAD_LENGTH) return { ok: false, recordId, error: { code: "encode-failed", message: "El Link del menú es demasiado largo para un QR" } };
  return { ok: true, recordId, menuUrl: menu.data };
}

function buildJob(payload: string, keyPrefix: string): Job {
  const contentHash = contentHashOf(payload);
  const svg = renderQrSvg(encodeMatrix(payload));
  return { key: qrStorageKey(contentHash, keyPrefix), payload, contentHash, svg, svgSha256: sha256Hex(svg) };
}

/** ¿Es el objeto que ya está en la clave EXACTAMENTE el que habríamos escrito? */
async function sameObject(job: Job, storage: StorageProvider): Promise<boolean | null> {
  const head = await storage.head(job.key);
  if (!head) return null;
  return head.metadata["svg-sha256"] === job.svgSha256;
}

const conflict = (job: Job): AssetOutcome => ({
  ok: false,
  error: { code: "storage-conflict", message: `Hay un archivo distinto en la clave del QR (${job.key.slice(-20)}): no se reutilizó ni se sobrescribió` },
});

/** Asegura que el SVG del QR existe en el storage, sin duplicar y sin pisar nada. */
async function ensureAsset(job: Job, deps: ResolveDeps): Promise<AssetOutcome> {
  const { storage, quota } = deps;
  const options = {
    contentType: "image/svg+xml",
    cacheControl: "public, max-age=31536000, immutable",
    contentDisposition: `inline; filename="qr-${job.contentHash.slice(0, 8)}.svg"`,
    ifNoneMatch: true,
    metadata: { "svg-sha256": job.svgSha256, renderer: QR_RENDERER_VERSION },
  } as const;

  try {
    // Sin cuota solo se puede reutilizar lo que ya existe.
    if (!quota.canCreate()) {
      const same = await sameObject(job, storage);
      if (same === null) return { ok: false, error: { code: "quota-exceeded", message: "Se alcanzó el máximo de QR nuevos por hora; los QR ya existentes se siguen reutilizando" } };
      return same ? { ok: true, created: false } : conflict(job);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!storage.capabilities.conditionalPut) {
        const same = await sameObject(job, storage);
        if (same === true) return { ok: true, created: false };
        if (same === false) return conflict(job);
      }
      const put = await storage.upload(job.key, job.svg, options);
      if (put.status === "created") {
        quota.consume();
        return { ok: true, created: true };
      }
      const same = await sameObject(job, storage);
      if (same === true) return { ok: true, created: false };
      if (same === false) return conflict(job);
      // «exists» pero ya no está (borrado entre medias): se reintenta una vez
    }
    return { ok: false, error: { code: "storage-failed", message: "No se pudo guardar el QR en el almacenamiento" } };
  } catch (error) {
    const message = error instanceof StorageError && error.code === "forbidden" ? "El almacenamiento rechazó la escritura (permisos)" : "Error de almacenamiento: no se pudo guardar el QR";
    return { ok: false, error: { code: "storage-failed", message } };
  }
}

/**
 * Genera (o reutiliza) los QR de los registros SIN Link del QR. Idempotente:
 * la clave depende solo del contenido, así que repetir la llamada, abrir otra
 * pestaña o reimportar nunca crea archivos nuevos.
 */
export async function resolveGenerate(rawItems: readonly unknown[], deps: ResolveDeps): Promise<ResolveSummary> {
  const parsed = rawItems.map(parseItem);
  const jobs = new Map<string, Job>();
  for (const item of parsed) {
    if (!item.ok) continue;
    const contentHash = contentHashOf(item.menuUrl);
    const key = qrStorageKey(contentHash, deps.keyPrefix);
    if (!jobs.has(key)) jobs.set(key, buildJob(item.menuUrl, deps.keyPrefix));
  }

  // Una sola subida por clave distinta del lote.
  const outcomes = new Map<string, AssetOutcome>();
  const unique = [...jobs.values()];
  const settled = await mapWithConcurrency(unique, deps.concurrency ?? 16, (job) => ensureAsset(job, deps));
  unique.forEach((job, i) => outcomes.set(job.key, settled[i] as AssetOutcome));

  const createdKeys = new Set<string>();
  const generatedAt = deps.now().toISOString();
  let reused = 0;
  let failures = 0;
  const results = parsed.map((item): QrResolution => {
    if (!item.ok) {
      failures++;
      return failed(item.recordId, item.error.code, item.error.message);
    }
    const contentHash = contentHashOf(item.menuUrl);
    const key = qrStorageKey(contentHash, deps.keyPrefix);
    const job = jobs.get(key) as Job;
    const outcome = outcomes.get(key) as AssetOutcome;
    if (!outcome.ok) {
      failures++;
      return failed(item.recordId, outcome.error.code, outcome.error.message);
    }
    // La primera pieza de una clave creada es «generado»; el resto del lote comparte el archivo («reutilizado»).
    const isCreation = outcome.created && !createdKeys.has(key);
    if (isCreation) createdKeys.add(key);
    else reused++;
    const qr: GeneratedQrSource = {
      source: "generated",
      storageKey: key,
      payload: job.payload,
      contentHash: job.contentHash,
      svgSha256: job.svgSha256,
      rendererVersion: QR_RENDERER_VERSION,
      generatedAt,
    };
    return { recordId: item.recordId, outcome: isCreation ? "generated" : "reused", qrUrl: deps.storage.getPublicUrl(key), qr };
  });

  return { results, created: createdKeys.size, reused, failed: failures };
}
