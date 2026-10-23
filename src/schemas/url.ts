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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** IPv4 de red local (10/8, 172.16/12, 192.168/16): la app compartida por IP dentro de la oficina, p. ej. http://192.168.1.20:3000. */
const LAN_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

/**
 * Link corto propio (`/s/{código}`) en una máquina de desarrollo. Sin `NEXT_PUBLIC_QR_DOMAIN` el dominio del link
 * corto es el origen de la aplicación (`http://localhost:3000`), que `z.httpUrl` rechaza; sin esta excepción cada pieza
 * quedaría inválida al probar en local. Solo `localhost`/`127.0.0.1` o una IP de red local (para compartir la app dentro de la
 * oficina), solo esa forma exacta y nunca fuera de ella. Un QR así solo se lee dentro de esa red: para imprimir, `NEXT_PUBLIC_QR_DOMAIN`.
 */
export function isLocalShortLink(raw: string): boolean {
  const url = URL.parse(raw.trim());
  return (
    url !== null &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    (LOCAL_HOSTNAMES.has(url.hostname) || LAN_IPV4.test(url.hostname)) &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    /^\/s\/[2-9a-hjkmnp-z]{8}$/.test(url.pathname) &&
    raw.trim().length <= MAX_URL_LENGTH
  );
}

/** Link del menú: se guarda en forma canónica WHATWG (es lo que se codifica en el QR). */
export const MenuUrlSchema = z.string().transform((raw, ctx) => {
  if (isLocalShortLink(raw)) return new URL(raw.trim()).href;
  const parsed = SafeHttpUrlSchema.safeParse(raw);
  if (parsed.success) return new URL(parsed.data).href;
  for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
  return z.NEVER;
});

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
