-- SOLO LOCAL (supabase db reset). Sustituto mínimo de la tabla de roles de PULSE para probar la RLS del módulo:
-- en PULSE real esto NO se aplica (ya existe su propia fuente de roles; ver qr_roles_del_usuario()).
CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE, role text NOT NULL);
