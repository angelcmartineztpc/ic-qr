import { z } from "zod";

/**
 * URLs (docs/ARCHITECTURE.md §C.2, §1.2-9).
 * - URL aportada por el usuario: z.httpUrl (http/https con dominio; rechaza
 *   javascript:, data:, file:, blob:, IPs, localhost, IDN) + sin espacios ni
 *   invisibles + sin credenciales.
 * - qrUrl generado por nosotros: derivado del storage; admite localhost/IP del provider local.
 */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Z}]/u;
export const MAX_URL_LENGTH = 2048;

export const SafeHttpUrlSchema = z
  .string()
  .trim()
  .min(1, { error: "La URL está vacía" })
  .max(MAX_URL_LENGTH, { error: `La URL supera ${MAX_URL_LENGTH} caracteres` })
  .refine((s) => !FORBIDDEN_CHARS.test(s), { error: "La URL contiene espacios o caracteres invisibles", abort: true })
  .pipe(z.httpUrl({ error: "Debe ser una URL http(s) válida con dominio" }))
  .superRefine((s, ctx) => {
    const url = URL.parse(s);
    if (url && (url.username || url.password)) {
      ctx.addIssue({ code: "custom", message: "La URL no puede incluir usuario o contraseña" });
    }
  });

/** Link del menú: se guarda en forma canónica WHATWG (es lo que se codifica en el QR). */
export const MenuUrlSchema = SafeHttpUrlSchema.transform((s) => new URL(s).href);

/** qrUrl GENERADO: derivado de storageKey (el servidor comprueba keyFromPublicUrl). */
export const GeneratedQrUrlSchema = z.url({ protocol: /^https?$/ }).max(MAX_URL_LENGTH);

export type QrHostPolicy = { mode: "public" } | { mode: "allowlist"; hosts: readonly string[] };

/** qrUrl APORTADO por el usuario: solo https y política de hosts. La IP pública real la comprueba safeFetch. */
export const makeExistingQrUrlSchema = (policy: QrHostPolicy) =>
  SafeHttpUrlSchema.superRefine((s, ctx) => {
    const url = URL.parse(s);
    if (!url) return;
    if (url.protocol !== "https:") ctx.addIssue({ code: "custom", message: "El link del QR debe usar https" });
    const host = url.hostname.toLowerCase();
    if (policy.mode === "allowlist" && !policy.hosts.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h))) {
      ctx.addIssue({ code: "custom", message: `Host no permitido para QR existentes: ${host}` });
    }
  });

/** Política del cliente: el servidor aplica además la lista de hosts configurada. */
export const ExistingQrUrlSchema = makeExistingQrUrlSchema({ mode: "public" });
