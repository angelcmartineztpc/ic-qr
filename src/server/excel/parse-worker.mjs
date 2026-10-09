/**
 * Worker de lectura de .xlsx (docs/ARCHITECTURE.md §S1.3). Corre en un hilo
 * aparte con límite de memoria: un archivo hostil mata este hilo, no el
 * servidor. Es JavaScript plano porque `new Worker()` necesita un archivo en
 * disco (en la salida standalone se copia con outputFileTracingIncludes).
 *
 * La lectura en sí vive en parse-core.mjs (compartida con el camino sin hilos de Cloudflare Workers).
 */
import { parentPort } from "node:worker_threads";

import { readSheet, scanWorkbook } from "./parse-core.mjs";

let zip = null;

function handle(message) {
  switch (message.op) {
    case "scan": {
      zip = message.zip;
      return { op: "scan", sheets: scanWorkbook(zip, message.rows) };
    }
    case "read": {
      if (!zip) throw new Error("sin libro cargado");
      return { op: "read", sheet: readSheet(zip, message.sheet, message.rows) };
    }
    default:
      throw new Error("operación desconocida");
  }
}

parentPort.on("message", (message) => {
  try {
    parentPort.postMessage(handle(message));
  } catch (error) {
    parentPort.postMessage({ op: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
