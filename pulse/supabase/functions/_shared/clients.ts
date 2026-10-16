import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getConfig } from "./config.ts";

const AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

let admin: SupabaseClient | undefined;

/** Service role: SOLO después de comprobar el JWT y el rol del usuario (o en rutas públicas de solo lectura). */
export function adminClient(): SupabaseClient {
  const { env } = getConfig();
  admin ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: AUTH });
  return admin;
}

/** Con el JWT del usuario: las políticas RLS y `qr_tiene_acceso()` se evalúan como esa persona. */
export function userClient(token: string): SupabaseClient {
  const { env } = getConfig();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: AUTH, global: { headers: { Authorization: `Bearer ${token}` } } });
}
