import "server-only";

import { getEnv } from "./env";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * Logger estructurado (JSON por línea). Reglas de redacción (§S7): nunca
 * query strings, cabeceras de autenticación ni contenido de campos; de las
 * URLs solo se registra el host con `hostOf`.
 */
function write(level: Level, message: string, fields?: LogFields): void {
  const env = getEnv();
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const entry = { time: new Date().toISOString(), level, message, ...fields };
  const line =
    env.LOG_FORMAT === "pretty"
      ? `${entry.time} ${level.toUpperCase()} ${message}${fields ? ` ${JSON.stringify(fields)}` : ""}`
      : JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};

/** Solo el host de una URL (o "invalid-url"), para no filtrar tokens ni rutas. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}
