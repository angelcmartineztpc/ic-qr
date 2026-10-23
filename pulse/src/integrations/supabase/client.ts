// ARNÉS: stub de PULSE, no fusionar
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Singleton. Sin variables de entorno se usa un host inválido para que el arnés arranque. */
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "anon-key-no-configurada");
