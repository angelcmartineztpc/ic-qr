import "server-only";

import { readFileSync } from "node:fs";

import { parseEnv, type Env } from "./config/env-schema";

let cached: Env | undefined;

/** Configuración validada del servidor. Se valida al arrancar (instrumentation.ts). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env, (path) => readFileSync(path, "utf8"));
  return cached;
}

export type { Env };
