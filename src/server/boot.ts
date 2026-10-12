/**
 * Arranque del servidor Node (llamado desde instrumentation.ts).
 * Valida el entorno con las reglas fail-closed y registra el apagado ordenado.
 */
import { readFileSync } from "node:fs";

import { parseEnv } from "./config/env-schema";
import { startDraining } from "./lifecycle";

export function boot(): void {
  let env;
  try {
    env = parseEnv(process.env, (path) => readFileSync(path, "utf8"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    // Fail-closed: en producción no se arranca con una configuración insegura o incompleta.
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw error;
  }

  process.once("SIGTERM", () => {
    startDraining();
    console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", message: "SIGTERM: apagado ordenado" }));
  });

  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      message: "QR Production Generator listo",
      nodeEnv: env.NODE_ENV,
      authMode: env.AUTH_MODE,
      storageProvider: env.STORAGE_PROVIDER,
      qrHostPolicy: env.QR_HOST_POLICY,
    }),
  );
}
