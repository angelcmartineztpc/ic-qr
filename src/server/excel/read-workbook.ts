import "server-only";

import path from "node:path";
import { Worker } from "node:worker_threads";

import type { RawSheet } from "@/lib/excel/types";

import { readSheet, scanWorkbook } from "./parse-core.mjs";
import { ImportRejection } from "./upload-guard";

const WORKER_FILE = "src/server/excel/parse-worker.mjs";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OLD_GENERATION_MB = 512;

export interface WorkbookReader {
  /** Pasada 1: las primeras filas de todas las hojas, solo para detectar cabeceras y elegir hoja. */
  scan(rows: number): Promise<RawSheet[]>;
  /** Pasada 2: la hoja elegida, hasta `rows` filas. */
  read(sheet: string, rows: number): Promise<RawSheet>;
  close(): void;
}

/** Cloudflare Workers no tiene `worker_threads`: ahí el libro se lee dentro de la propia petición. */
function supportsWorkerThreads(): boolean {
  return !(typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");
}

/**
 * Sin hilo no se puede matar una lectura colgada ni limitar su memoria; ahí lo hacen los límites de
 * la plataforma (CPU y memoria por petición, aislada de las demás) y los de upload-guard (tamaño,
 * celdas e inflado) que se comprueban antes de leer.
 */
function openWorkbookInline(zip: Uint8Array): WorkbookReader {
  const guard = <T>(read: () => T): T => {
    try {
      return read();
    } catch {
      throw new ImportRejection("ZIP_CORRUPT", "SheetJS no pudo leer el libro");
    }
  };
  return {
    async scan(rows) {
      return guard(() => scanWorkbook(zip.slice(), rows) as RawSheet[]);
    },
    async read(sheet, rows) {
      return guard(() => readSheet(zip.slice(), sheet, rows) as RawSheet);
    },
    close() {},
  };
}

/**
 * Abre un worker con límite de memoria y un temporizador global: si algo se
 * cuelga o se come la memoria, se mata el hilo y la importación se rechaza
 * con PARSE_TIMEOUT; el servidor sigue atendiendo.
 */
export function openWorkbook(zip: Uint8Array, options: { timeoutMs?: number } = {}): WorkbookReader {
  if (!supportsWorkerThreads()) return openWorkbookInline(zip);
  const worker = new Worker(/* turbopackIgnore: true */ path.join(process.cwd(), WORKER_FILE), { resourceLimits: { maxOldGenerationSizeMb: MAX_OLD_GENERATION_MB } });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let closed = false;
  let pending: { resolve(value: unknown): void; reject(error: unknown): void } | null = null;

  const fail = (error: unknown) => {
    const current = pending;
    pending = null;
    current?.reject(error);
  };
  worker.on("message", (message: { op: string; message?: string }) => {
    const current = pending;
    pending = null;
    if (!current) return;
    if (message.op === "error") current.reject(new ImportRejection("ZIP_CORRUPT", "SheetJS no pudo leer el libro"));
    else current.resolve(message);
  });
  worker.on("error", (error) => fail(error instanceof Error && /memory|heap/i.test(error.message) ? new ImportRejection("TOO_MANY_CELLS") : new ImportRejection("ZIP_CORRUPT", "No se pudo leer el libro")));
  worker.on("exit", () => fail(new ImportRejection(closed ? "ZIP_CORRUPT" : "PARSE_TIMEOUT")));

  const timer = setTimeout(() => {
    fail(new ImportRejection("PARSE_TIMEOUT"));
    void worker.terminate();
  }, timeoutMs);
  timer.unref();

  const call = <T>(message: Record<string, unknown>, transfer?: ArrayBuffer[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending = { resolve: resolve as (value: unknown) => void, reject };
      worker.postMessage(message, transfer ?? []);
    });

  return {
    async scan(rows) {
      // La copia evita transferir (y vaciar) el buffer del llamador.
      const copy = zip.slice();
      const reply = await call<{ sheets: RawSheet[] }>({ op: "scan", zip: copy, rows }, [copy.buffer as ArrayBuffer]);
      return reply.sheets;
    },
    async read(sheet, rows) {
      return (await call<{ sheet: RawSheet }>({ op: "read", sheet, rows })).sheet;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      void worker.terminate();
    },
  };
}
