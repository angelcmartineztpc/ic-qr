-- patch-qr-produccion.sql
-- Módulo «QR Producción» de PULSE: tablas, RLS, buckets de Storage y semillas.
-- Idempotente (se puede ejecutar más de una vez). Aplicar con `supabase db push` (copiar a
-- supabase/migrations/<fecha>_qr_produccion.sql) o pegar en el SQL Editor.
--
-- QUÉ NO ESTÁ VERIFICADO (no hay Postgres ni Supabase CLI en la máquina donde se escribió):
--   * la sintaxis se revisó a mano; ejecútalo primero en una rama/entorno de pruebas;
--   * `qr_roles_del_usuario()` ADIVINA dónde guarda PULSE los roles (ver el bloque «AJUSTAR»);
--   * las políticas de `storage.objects` usan el esquema estándar de Supabase Storage.
--
-- REALTIME: ninguna tabla de este módulo necesita `supabase_realtime`. El proyecto tiene un único
-- escritor (Web Locks entre pestañas) y se carga una vez al abrir; los links cortos y los QR son
-- inmutables o se leen bajo demanda. Por eso NO hay `ALTER PUBLICATION supabase_realtime ADD TABLE …`.

-- =====================================================================================
-- 1. Roles
-- =====================================================================================
-- AJUSTAR: PULSE expone los roles en `useAuth().userRoles`; aquí se leen de la base. Esta función
-- soporta las dos formas habituales y devuelve '{}' si ninguna existe. Es el ÚNICO sitio que hay
-- que cambiar si los roles viven en otra tabla o en el JWT (`auth.jwt() -> 'app_metadata' -> 'roles'`).
--   a) public.user_roles (user_id uuid, role text)
--   b) public.profiles   (id uuid, roles text[])
CREATE OR REPLACE FUNCTION public.qr_roles_del_usuario()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resultado text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN resultado;
  END IF;
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(array_agg(role::text), ''{}'') FROM public.user_roles WHERE user_id = $1'
      INTO resultado USING auth.uid();
  ELSIF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(roles::text[], ''{}'') FROM public.profiles WHERE id = $1'
      INTO resultado USING auth.uid();
  END IF;
  RETURN coalesce(resultado, '{}');
END;
$$;

-- Admin o «QR Producción»: puede usar el módulo.
CREATE OR REPLACE FUNCTION public.qr_tiene_acceso()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qr_roles_del_usuario() && ARRAY['Admin', 'QR Producción']::text[];
$$;

-- Solo Admin: catálogo de destinos por resort y tipografías.
CREATE OR REPLACE FUNCTION public.qr_es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'Admin' = ANY (public.qr_roles_del_usuario());
$$;

REVOKE ALL ON FUNCTION public.qr_roles_del_usuario() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qr_tiene_acceso() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qr_es_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qr_roles_del_usuario() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qr_tiene_acceso() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qr_es_admin() TO authenticated, service_role;

-- =====================================================================================
-- 2. qr_proyectos — fuente de verdad del proyecto (DB-first); IndexedDB queda como caché local
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.qr_proyectos (
  -- El `projectId` que genera el cliente (UUID v4): así el primer guardado es un upsert idempotente.
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL DEFAULT '' CHECK (char_length(nombre) <= 200),
  -- PersistedProject completo (registros, plantilla, layout, opciones). Los SVG/PDF NUNCA van aquí.
  datos          jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object' AND pg_column_size(datos) <= 25000000),
  schema_version integer NOT NULL DEFAULT 2,
  -- Control de concurrencia optimista: el trigger la incrementa; el cliente actualiza con `WHERE revision = <esperada>`.
  revision       bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  owner_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_proyectos_owner_idx ON public.qr_proyectos (owner_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.qr_proyectos_antes_de_actualizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;
  -- Solo un Admin puede reasignar el propietario.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT public.qr_es_admin() THEN
    NEW.owner_id := OLD.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qr_proyectos_actualizar ON public.qr_proyectos;
CREATE TRIGGER qr_proyectos_actualizar
  BEFORE UPDATE ON public.qr_proyectos
  FOR EACH ROW EXECUTE FUNCTION public.qr_proyectos_antes_de_actualizar();

ALTER TABLE public.qr_proyectos ENABLE ROW LEVEL SECURITY;

-- Lectura y escritura: el propietario, o quien tenga el rol Admin / «QR Producción» (equipo de producción:
-- ve y edita los proyectos de todos). Crear exige el rol y que el propietario sea quien crea; borrar, ser el
-- propietario o Admin. `USING (true)` no se usa en ninguna política.
DROP POLICY IF EXISTS qr_proyectos_select ON public.qr_proyectos;
CREATE POLICY qr_proyectos_select ON public.qr_proyectos
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.qr_tiene_acceso());

DROP POLICY IF EXISTS qr_proyectos_insert ON public.qr_proyectos;
CREATE POLICY qr_proyectos_insert ON public.qr_proyectos
  FOR INSERT TO authenticated
  WITH CHECK (public.qr_tiene_acceso() AND owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS qr_proyectos_update ON public.qr_proyectos;
CREATE POLICY qr_proyectos_update ON public.qr_proyectos
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.qr_tiene_acceso())
  WITH CHECK (owner_id = (SELECT auth.uid()) OR public.qr_tiene_acceso());

DROP POLICY IF EXISTS qr_proyectos_delete ON public.qr_proyectos;
CREATE POLICY qr_proyectos_delete ON public.qr_proyectos
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.qr_es_admin());

-- =====================================================================================
-- 3. qr_activos — catálogo de QR por contenido: content_hash UNIQUE → storage_key
-- =====================================================================================
-- Lo escribe SOLO la función `qr-resolver` (service role): no hay políticas de escritura. Una fila por QR
-- generado («generado») o por instantánea de un QR de terceros verificado («externo»).
CREATE TABLE IF NOT EXISTS public.qr_activos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL DEFAULT 'generado' CHECK (tipo IN ('generado', 'externo')),
  content_hash text NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  storage_key  text NOT NULL UNIQUE CHECK (storage_key ~ '^(?:[a-z0-9][a-z0-9-]*/)?qr/(?:v[0-9]+/[0-9a-f]{64}\.svg|ext/v[0-9]+/[0-9a-f]{64}\.json)$'),
  bucket       text NOT NULL DEFAULT 'qr-produccion',
  -- «generado»: sha256 del SVG almacenado y versión del renderer (detectan un archivo distinto en la misma clave).
  svg_sha256   text CHECK (svg_sha256 IS NULL OR svg_sha256 ~ '^[0-9a-f]{64}$'),
  renderer     text,
  created_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- La cuota «QR nuevos por hora» cuenta filas recientes.
CREATE INDEX IF NOT EXISTS qr_activos_creados_idx ON public.qr_activos (created_at DESC);

ALTER TABLE public.qr_activos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_activos_select ON public.qr_activos;
CREATE POLICY qr_activos_select ON public.qr_activos
  FOR SELECT TO authenticated
  USING (public.qr_tiene_acceso());

-- =====================================================================================
-- 4. qr_enlaces — código corto de 8 caracteres ↔ URL destino
-- =====================================================================================
-- Lo escribe SOLO la función `qr-enlaces` (service role). El redirect público /s/{código} también la lee
-- con service role: la tabla NO se abre a `anon`.
CREATE TABLE IF NOT EXISTS public.qr_enlaces (
  codigo       text PRIMARY KEY CHECK (codigo ~ '^[2-9a-hjkmnp-z]{8}$'),
  -- A dónde lleva hoy (editable: «Cambiar destino»). El QR impreso apunta al código y no cambia.
  destino      text NOT NULL CHECK (char_length(destino) <= 2048 AND destino ~ '^https?://'),
  -- El link que se acortó la primera vez, ya normalizado (WHATWG). Nunca cambia. UNIQUE: acortar el mismo
  -- link dos veces (otro Excel, otra pestaña, dos personas a la vez) da SIEMPRE el mismo código.
  url_original text NOT NULL UNIQUE CHECK (char_length(url_original) <= 2048),
  revision     integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  -- [{ "destination": "https://…", "at": "2026-…Z" }], el más reciente primero, máx. 20.
  historial    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(historial) = 'array' AND jsonb_array_length(historial) <= 20),
  created_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_enlaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_enlaces_select ON public.qr_enlaces;
CREATE POLICY qr_enlaces_select ON public.qr_enlaces
  FOR SELECT TO authenticated
  USING (public.qr_tiene_acceso());

-- =====================================================================================
-- 5. Catálogo de resorts y destinos (antes vivía en código: src/lib/resorts/properties.ts)
-- =====================================================================================
-- Cambiar a dónde lleva `/api/qr/{resort}/{servicio}` pasa de «editar código y desplegar» a editar esta tabla.
CREATE TABLE IF NOT EXISTS public.qr_resorts (
  codigo     text PRIMARY KEY CHECK (codigo ~ '^[A-Z0-9]{2,8}$'),
  slug       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qr_destinos_resort (
  resort_codigo text NOT NULL REFERENCES public.qr_resorts (codigo) ON UPDATE CASCADE ON DELETE CASCADE,
  servicio      text NOT NULL CHECK (servicio IN ('pool', 'restaurant')),
  destino       text NOT NULL CHECK (char_length(destino) <= 2048 AND destino ~ '^https?://'),
  updated_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resort_codigo, servicio)
);

ALTER TABLE public.qr_resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_destinos_resort ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_resorts_select ON public.qr_resorts;
CREATE POLICY qr_resorts_select ON public.qr_resorts FOR SELECT TO authenticated USING (public.qr_tiene_acceso());
DROP POLICY IF EXISTS qr_resorts_admin ON public.qr_resorts;
CREATE POLICY qr_resorts_admin ON public.qr_resorts FOR ALL TO authenticated USING (public.qr_es_admin()) WITH CHECK (public.qr_es_admin());

DROP POLICY IF EXISTS qr_destinos_select ON public.qr_destinos_resort;
CREATE POLICY qr_destinos_select ON public.qr_destinos_resort FOR SELECT TO authenticated USING (public.qr_tiene_acceso());
DROP POLICY IF EXISTS qr_destinos_admin ON public.qr_destinos_resort;
CREATE POLICY qr_destinos_admin ON public.qr_destinos_resort FOR ALL TO authenticated USING (public.qr_es_admin()) WITH CHECK (public.qr_es_admin());

CREATE OR REPLACE FUNCTION public.qr_destinos_antes_de_escribir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qr_destinos_escribir ON public.qr_destinos_resort;
CREATE TRIGGER qr_destinos_escribir
  BEFORE INSERT OR UPDATE ON public.qr_destinos_resort
  FOR EACH ROW EXECUTE FUNCTION public.qr_destinos_antes_de_escribir();

-- Semillas: las 9 propiedades y sus dos servicios (mismos destinos que el catálogo del código).
INSERT INTO public.qr_resorts (codigo, slug, nombre) VALUES
  ('PRPL', 'playacar', 'Playacar'),
  ('LBCU', 'leblanc-cancun', 'LeBlanc Cancún'),
  ('LBLC', 'leblanc-los-cabos', 'LeBlanc Los Cabos'),
  ('MPCU', 'moon-palace-sunrise', 'Moon Palace Sunrise'),
  ('MPNI', 'moon-palace-nizuc', 'Moon Palace Nizuc'),
  ('PRBP', 'beach-palace', 'Beach Palace'),
  ('PRCZ', 'cozumel', 'Cozumel'),
  ('TGCU', 'grand-cancun', 'The Grand Cancún'),
  ('TGPC', 'grand-punta-cana', 'Grand Punta Cana')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.qr_destinos_resort (resort_codigo, servicio, destino)
SELECT r.codigo, s.servicio, 'https://pool-service.palaceresorts.com/' || s.ruta || '/' || r.codigo
FROM public.qr_resorts r
CROSS JOIN (VALUES ('pool', 'pool-area'), ('restaurant', 'restaurant')) AS s (servicio, ruta)
ON CONFLICT (resort_codigo, servicio) DO NOTHING;

-- =====================================================================================
-- 6. Storage
-- =====================================================================================
-- qr-produccion (PRIVADO): SVG de los QR generados (qr/v1/{sha256}.svg), instantáneas de QR de terceros
--   (qr/ext/v1/{sha256}.json) y, si se sube, el logo. Los QR se sirven por la función `qr-resolver`
--   (GET …/storage/qr/v1/{sha256}.svg), porque el `qrUrl` debe abrirse fuera de la app sin sesión.
-- qr-fuentes (PRIVADO): tipografías comerciales (Address Sans Pro Cd, Gotham). Nunca se versionan en git ni
--   se sirven al navegador: solo las lee `qr-exportar` / `qr-vista-previa` con service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('qr-produccion', 'qr-produccion', false, 1048576, ARRAY['image/svg+xml', 'application/json']),
  ('qr-fuentes', 'qr-fuentes', false, 10485760, ARRAY['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-woff', 'application/font-sfnt', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- qr-produccion: leer, quien use el módulo. Escribir: nadie desde el cliente (lo hace `qr-resolver`, service role).
DROP POLICY IF EXISTS qr_produccion_leer ON storage.objects;
CREATE POLICY qr_produccion_leer ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'qr-produccion' AND public.qr_tiene_acceso());

-- qr-fuentes: sin lectura para el cliente. Un Admin puede subir/reemplazar tipografías desde el panel.
DROP POLICY IF EXISTS qr_fuentes_subir ON storage.objects;
CREATE POLICY qr_fuentes_subir ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qr-fuentes' AND public.qr_es_admin());

DROP POLICY IF EXISTS qr_fuentes_actualizar ON storage.objects;
CREATE POLICY qr_fuentes_actualizar ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-fuentes' AND public.qr_es_admin())
  WITH CHECK (bucket_id = 'qr-fuentes' AND public.qr_es_admin());

DROP POLICY IF EXISTS qr_fuentes_borrar ON storage.objects;
CREATE POLICY qr_fuentes_borrar ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-fuentes' AND public.qr_es_admin());
