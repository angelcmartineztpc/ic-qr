/**
 * Esquema de variables de entorno (docs/ARCHITECTURE.md §S11).
 *
 * Este módulo es puro (sin `server-only` ni lectura directa de process.env)
 * para poder usarlo desde src/proxy.ts, que no corre en la capa react-server,
 * y desde los tests. El acceso cacheado está en src/server/env.ts.
 */
import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const bool = (fallback: boolean) => z.stringbool().default(fallback);
const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : value.trim()));

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // --- App ---
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    APP_ORIGINS: csv,
    APP_ALLOWED_HOSTS: csv,
    TRUST_PROXY_HOPS: int(0),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),

    // --- Autenticación ---
    AUTH_MODE: z.enum(["none", "basic", "proxy"]).default("none"),
    BASIC_AUTH_USER: optionalSecret,
    BASIC_AUTH_PASSWORD_SHA256: optionalSecret,
    PROXY_SHARED_SECRET: optionalSecret,
    ALLOW_UNAUTHENTICATED: bool(false),

    // --- Storage ---
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    STORAGE_BUCKET: optionalSecret,
    STORAGE_REGION: z.string().default("auto"),
    STORAGE_ENDPOINT: optionalSecret,
    STORAGE_ACCESS_KEY: optionalSecret,
    STORAGE_SECRET_KEY: optionalSecret,
    STORAGE_FORCE_PATH_STYLE: bool(false),
    STORAGE_PUBLIC_BASE_URL: z.string().default("http://localhost:3000/api/storage"),
    STORAGE_KEY_PREFIX: z
      .string()
      .regex(/^(?:[a-z0-9-]+\/?)?$/, { error: "Un solo segmento en minúsculas, números y guiones (p. ej. prod/)" })
      .default(""),
    STORAGE_CONDITIONAL_PUT: z.enum(["auto", "true", "false"]).default("auto"),
    STORAGE_MAX_CONCURRENCY: int(16, 1),
    STORAGE_LOCAL_DIR: z.string().default("./.data/storage"),
    ALLOW_LOCAL_STORAGE_IN_PROD: bool(false),

    // --- Fuentes ---
    FONTS_DIR: z.string().default("./assets/fonts"),

    // --- QR ---
    QR_HOST_POLICY: z.enum(["public", "allowlist"]).default("public"),
    QR_ALLOWED_HOSTS: csv,
    QR_FETCH_TIMEOUT_MS: int(5000, 100),
    QR_FETCH_MAX_BYTES: int(524_288, 1024),
    QR_FETCH_DIRECT_EGRESS_CONFIRMED: bool(false),
    QR_RESOLVE_MAX_BATCH: int(100, 1),
    QR_MAX_NEW_OBJECTS_PER_HOUR: int(2000, 1),

    // --- Límites y rate limit ---
    IMPORT_MAX_BYTES: int(10_485_760, 1024),
    IMPORT_MAX_ROWS: int(5000, 1),
    IMPORT_MAX_ENTRY_INFLATED: int(20_971_520, 1024),
    IMPORT_MAX_TOTAL_INFLATED: int(41_943_040, 1024),
    IMPORT_MAX_CELLS: int(300_000, 1),
    IMPORT_MAX_CONCURRENCY: int(2, 1),
    EXPORT_MAX_RECORDS: int(5000, 1),
    EXPORT_MAX_BODY_BYTES: int(8_388_608, 1024),
    EXPORT_MAX_CONCURRENCY: int(2, 1),
    EXPORT_TIMEOUT_MS: int(60_000, 1000),
    RATE_LIMIT_RESOLVE_PER_MIN: int(30, 1),
    RATE_LIMIT_IMPORT_PER_MIN: int(10, 1),
    RATE_LIMIT_EXPORT_PER_MIN: int(6, 1),
    RATE_LIMIT_ASSET_PER_MIN: int(300, 1),

    // Variables de proxy de salida: solo se leen para la regla de arranque.
    HTTP_PROXY: z.string().optional(),
    HTTPS_PROXY: z.string().optional(),
    NODE_USE_ENV_PROXY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const production = env.NODE_ENV === "production";

    if (env.AUTH_MODE === "none" && production && !env.ALLOW_UNAUTHENTICATED) {
      fail("AUTH_MODE", "AUTH_MODE=none no está permitido en producción (usa basic o proxy, o ALLOW_UNAUTHENTICATED=true)");
    }
    if (env.AUTH_MODE === "basic") {
      if (!env.BASIC_AUTH_USER) fail("BASIC_AUTH_USER", "obligatorio con AUTH_MODE=basic");
      if (!env.BASIC_AUTH_PASSWORD_SHA256 || !/^[0-9a-f]{64}$/i.test(env.BASIC_AUTH_PASSWORD_SHA256)) {
        fail("BASIC_AUTH_PASSWORD_SHA256", "debe ser el SHA-256 en hexadecimal (64 caracteres); genera uno con `bun run hash-password`");
      }
    }
    if (env.AUTH_MODE === "proxy" && (!env.PROXY_SHARED_SECRET || env.PROXY_SHARED_SECRET.length < 32)) {
      fail("PROXY_SHARED_SECRET", "obligatorio con AUTH_MODE=proxy (mínimo 32 caracteres)");
    }

    if (production) {
      if (env.APP_ORIGINS.length === 0) fail("APP_ORIGINS", "obligatorio en producción");
      if (env.APP_ALLOWED_HOSTS.length === 0) fail("APP_ALLOWED_HOSTS", "obligatorio en producción");
      const localBase = /^http:|\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(env.STORAGE_PUBLIC_BASE_URL);
      if (env.STORAGE_PROVIDER === "local" && localBase && !env.ALLOW_LOCAL_STORAGE_IN_PROD) {
        fail("STORAGE_PROVIDER", "el storage local con base http/localhost no se permite en producción (ALLOW_LOCAL_STORAGE_IN_PROD=true para forzarlo)");
      }
    }

    if (env.STORAGE_PROVIDER === "s3" && !env.STORAGE_BUCKET) {
      fail("STORAGE_BUCKET", "obligatorio con STORAGE_PROVIDER=s3");
    }
    if (env.QR_HOST_POLICY === "allowlist" && env.QR_ALLOWED_HOSTS.length === 0) {
      fail("QR_ALLOWED_HOSTS", "obligatorio con QR_HOST_POLICY=allowlist");
    }
    const egressProxy = env.HTTP_PROXY || env.HTTPS_PROXY || env.NODE_USE_ENV_PROXY;
    if (egressProxy && !env.QR_FETCH_DIRECT_EGRESS_CONFIRMED) {
      fail(
        "QR_FETCH_DIRECT_EGRESS_CONFIRMED",
        "hay variables de proxy de salida definidas: la protección SSRF fija la IP del destino y no funciona a través de un proxy (confirma con QR_FETCH_DIRECT_EGRESS_CONFIRMED=true)",
      );
    }
  })
  .transform((env) => ({
    ...env,
    // En desarrollo se aceptan los orígenes locales habituales si no se configuran.
    APP_ORIGINS: env.APP_ORIGINS.length > 0 ? env.APP_ORIGINS : ["http://localhost:3000", "http://127.0.0.1:3000"],
    APP_ALLOWED_HOSTS:
      env.APP_ALLOWED_HOSTS.length > 0 ? env.APP_ALLOWED_HOSTS : ["localhost:3000", "127.0.0.1:3000"],
  }));

export type Env = z.output<typeof EnvSchema>;

/** Secretos que admiten la variante `<NOMBRE>_FILE` (Docker/Kubernetes secrets). */
export const FILE_SECRETS = [
  "BASIC_AUTH_PASSWORD_SHA256",
  "PROXY_SHARED_SECRET",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
] as const;

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Resuelve `*_FILE` y valida. Lanza un Error con todos los problemas juntos
 * para que el arranque falle con un mensaje útil (fail-closed).
 */
export function parseEnv(source: EnvSource, readFile: (path: string) => string): Env {
  const resolved: Record<string, string | undefined> = { ...source };
  for (const name of FILE_SECRETS) {
    const filePath = source[`${name}_FILE`];
    if (filePath && !source[name]) resolved[name] = readFile(filePath).trim();
  }
  const result = EnvSchema.safeParse(resolved);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(env)"}: ${issue.message}`);
    throw new Error(`Configuración de entorno inválida:\n${lines.join("\n")}`);
  }
  return result.data;
}
