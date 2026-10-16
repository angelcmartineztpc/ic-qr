import type { QrResolution } from "@/types";

/** Error de la API con el mensaje en español que el servidor ya redactó. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------- transporte: Edge Functions de Supabase con el JWT de la sesión ----------

type ViteEnv = Record<string, string | undefined>;
// `import.meta.env` literal: Vite y vitest solo lo sustituyen (y `vi.stubEnv` solo lo ve) escrito así.
const viteEnv = (): ViteEnv => (import.meta.env as ViteEnv | undefined) ?? {};

/**
 * Base de las Edge Functions: `VITE_QR_FUNCTIONS_URL` si se define (otro dominio o un proxy) o
 * `${VITE_SUPABASE_URL}/functions/v1`. Se usa `fetch` y no `supabase.functions.invoke` porque la exportación
 * es un stream binario de frames con progreso y `invoke` entrega el cuerpo ya leído entero.
 */
export function functionsBase(env: ViteEnv = viteEnv()): string {
  return (env["VITE_QR_FUNCTIONS_URL"] || `${env["VITE_SUPABASE_URL"] ?? ""}/functions/v1`).replace(/\/+$/, "");
}

/** URL de una función (y, si hace falta, de una ruta dentro de ella): `functionUrl("qr-enlaces", "/shorten")`. */
export const functionUrl = (name: string, path = ""): string => `${functionsBase()}/${name}${path}`;

/**
 * `fetch` que añade el JWT de la sesión de PULSE (`Authorization: Bearer …`). El cliente de Supabase se carga
 * al primer uso (singleton de `@/integrations/supabase/client`). Sin sesión se envía igualmente y el servidor
 * responde 401 «Inicia sesión…», que la interfaz muestra tal cual.
 */
export const authedFetch: typeof fetch = async (input, init) => {
  // Sin proyecto de Supabase configurado no hay sesión que añadir (arnés y pruebas): la petición sale tal cual y sin esperas.
  if (!viteEnv()["VITE_SUPABASE_URL"]) return fetch(input, init);
  // Se conserva la forma de las cabeceras (objeto plano → objeto plano) para no cambiar su capitalización.
  const source = init?.headers;
  const headers: Record<string, string> = source instanceof Headers || Array.isArray(source) ? Object.fromEntries(new Headers(source)) : { ...(source as Record<string, string> | undefined) };
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session) headers["Authorization"] = `Bearer ${data.session.access_token}`;
  } catch {
    /* sin cliente de Supabase (pruebas): la petición sale sin sesión */
  }
  const anonKey = viteEnv()["VITE_SUPABASE_ANON_KEY"];
  if (anonKey) headers["apikey"] ??= anonKey;
  return fetch(input, { ...init, headers });
};

interface ErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
}

/**
 * El mensaje de un fallo HTTP. Los errores de la función traen su `requestId` y ya vienen en español; los de la
 * plataforma (límite de recursos, tiempo agotado, función caída) no, así que se explican aquí.
 */
export function describeHttpFailure(status: number, payload: ErrorPayload): string {
  if (payload.requestId && payload.message) return payload.message;
  switch (status) {
    case 546:
      return "La operación necesitó más recursos de los que el servidor permite. Inténtalo con menos piezas.";
    case 504:
      return "El servidor tardó demasiado en responder. Inténtalo con menos piezas.";
    case 404:
      // «Requested function was not found»: el gateway de Supabase, no una de nuestras respuestas (esas llevan referencia).
      return /function/i.test(payload.message ?? "") ? "No se encontró la función en el servidor. Revisa que esté desplegada." : (payload.message ?? "No se encontró lo que se pidió");
    default:
      return payload.message ?? `El servidor respondió ${status}`;
  }
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  let payload: ErrorPayload = {};
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    /* respuesta sin JSON (proxy, 502…) */
  }
  return new ApiError(response.status, payload.code ?? "HTTP_ERROR", describeHttpFailure(response.status, payload), payload.requestId);
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal, fetchImpl: typeof fetch = authedFetch): Promise<T> {
  const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as T;
}

export interface ResolveRequestBody {
  items?: Array<{ recordId: string; menuUrl: string; expectedRevision: number }>;
  verify?: Array<{ recordId: string; qrUrl: string; menuUrl: string }>;
}

export interface ResolveResponse {
  results: QrResolution[];
  created: number;
  reused: number;
  failed: number;
}

export type ResolveFetcher = (body: ResolveRequestBody, signal: AbortSignal) => Promise<ResolveResponse>;

export const fetchResolve: ResolveFetcher = (body, signal) => postJson<ResolveResponse>(functionUrl("qr-resolver"), body, signal);
