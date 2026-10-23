/**
 * Configuración de las Edge Functions, leída de los secretos de Supabase (`supabase secrets set …`).
 * Puro (recibe un objeto): la lectura de `Deno.env` está en supabase/functions/_shared/config.ts.
 * Todo tiene un valor por defecto seguro salvo lo que Supabase inyecta (URL y claves).
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

const int = (fallback: number, min = 0) => z.coerce.number({ error: "debe ser un número" }).int({ error: "debe ser un entero" }).min(min, { error: `debe ser ≥ ${min}` }).default(fallback);
const secret = z.string({ error: "falta (lo inyecta Supabase)" }).min(1, { error: "no puede estar vacío" });

export const EnvSchema = z
  .object({
    // --- Inyectadas por Supabase en cada función ---
    SUPABASE_URL: z.url({ error: "debe ser la URL del proyecto" }),
    SUPABASE_ANON_KEY: secret,
    SUPABASE_SERVICE_ROLE_KEY: secret,

    // --- Orígenes, dominios y storage ---
    /** Orígenes del frontend de PULSE para CORS (vacío = `*`: la autenticación es un JWT, no cookies). */
    QR_ALLOWED_ORIGINS: csv,
    /** Dominio PERMANENTE de los links cortos y estables (queda grabado en cada pieza). Vacío = la URL de `qr-enlaces`. */
    QR_PUBLIC_BASE: z.string().default(""),
    /** Base pública de los QR generados. Vacío = `…/functions/v1/qr-resolver/storage`. */
    QR_STORAGE_PUBLIC_BASE: z.string().default(""),
    /** Un solo segmento (p. ej. `prod/`) delante de `qr/v1/…`, para compartir bucket entre entornos. */
    QR_KEY_PREFIX: z
      .string()
      .regex(/^(?:[a-z0-9-]+\/?)?$/, { error: "Un solo segmento en minúsculas, números y guiones (p. ej. prod/)" })
      .default(""),
    QR_BUCKET: z.string().default("qr-produccion"),
    QR_FONTS_BUCKET: z.string().default("qr-fuentes"),

    // --- QR de terceros (Link del QR) ---
    QR_HOST_POLICY: z.enum(["public", "allowlist"]).default("public"),
    QR_ALLOWED_HOSTS: csv,
    QR_FETCH_TIMEOUT_MS: int(5000, 100),
    QR_FETCH_MAX_BYTES: int(524_288, 1024),
    /**
     * Registros por llamada a `qr-resolver`. Verificar un QR existente rasteriza y decodifica (CPU):
     * con el techo de 2 s de CPU de las Edge Functions, 25 es lo prudente. Generar es barato.
     */
    QR_RESOLVE_MAX_BATCH: int(50, 1),
    QR_VERIFY_CONCURRENCY: int(4, 1),
    QR_MAX_NEW_OBJECTS_PER_HOUR: int(2000, 1),

    // --- Importación ---
    IMPORT_MAX_BYTES: int(10_485_760, 1024),
    IMPORT_MAX_ROWS: int(5000, 1),
    IMPORT_MAX_ENTRY_INFLATED: int(20_971_520, 1024),
    IMPORT_MAX_TOTAL_INFLATED: int(41_943_040, 1024),
    IMPORT_MAX_CELLS: int(300_000, 1),
    IMPORT_MAX_CONCURRENCY: int(1, 1),

    // --- Exportación ---
    /** Piezas por llamada (≈ 1,5 s de CPU con 100 en el peor caso medido). El cliente divide una exportación mayor en lotes de 100: no subir sin medir en Deno. */
    EXPORT_MAX_RECORDS: int(100, 1),
    EXPORT_MAX_BODY_BYTES: int(8_388_608, 1024),
    EXPORT_MAX_CONCURRENCY: int(1, 1),
    EXPORT_TIMEOUT_MS: int(120_000, 1000),

    // --- Rate limit por usuario/IP y por instancia (isolate) ---
    RATE_LIMIT_RESOLVE_PER_MIN: int(30, 1),
    RATE_LIMIT_IMPORT_PER_MIN: int(10, 1),
    RATE_LIMIT_EXPORT_PER_MIN: int(12, 1),
    RATE_LIMIT_PREVIEW_PER_MIN: int(600, 1),
    RATE_LIMIT_LINKS_PER_MIN: int(120, 1),
    /** Rutas públicas (redirect de links): por IP. */
    RATE_LIMIT_PUBLIC_PER_MIN: int(600, 1),
  })
  .superRefine((env, ctx) => {
    if (env.QR_HOST_POLICY === "allowlist" && env.QR_ALLOWED_HOSTS.length === 0) {
      ctx.addIssue({ code: "custom", path: ["QR_ALLOWED_HOSTS"], message: "obligatorio con QR_HOST_POLICY=allowlist" });
    }
    for (const name of ["QR_PUBLIC_BASE", "QR_STORAGE_PUBLIC_BASE"] as const) {
      const value = env[name];
      if (value !== "" && !URL.canParse(value)) ctx.addIssue({ code: "custom", path: [name], message: "debe ser una URL https completa" });
      if (value !== "" && URL.parse(value)?.protocol !== "https:" && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value)) ctx.addIssue({ code: "custom", path: [name], message: "debe usar https (http solo en localhost)" });
    }
  });

export type QrEnv = z.output<typeof EnvSchema>;

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Valida de golpe: lanza UN error con todos los problemas (los secretos mal puestos se corrigen de una vez). */
export function parseQrEnv(source: EnvSource): QrEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(env)"}: ${issue.message}`);
    throw new Error(`Configuración de entorno inválida:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** URLs derivadas: el dominio de los links y la base de los QR, con su valor por defecto en las funciones. */
export function derivedUrls(env: Pick<QrEnv, "SUPABASE_URL" | "QR_PUBLIC_BASE" | "QR_STORAGE_PUBLIC_BASE">) {
  const functions = `${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;
  return {
    functionsBase: functions,
    linksFallbackBase: `${functions}/qr-enlaces`,
    storagePublicBase: (env.QR_STORAGE_PUBLIC_BASE || `${functions}/qr-resolver/storage`).replace(/\/+$/, ""),
  };
}
