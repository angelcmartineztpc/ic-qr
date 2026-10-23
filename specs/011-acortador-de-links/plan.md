# Plan de implementación: Acortador de links del menú

**Spec**: [spec.md](spec.md)

## Resumen

El QR deja de codificar el link largo del menú y codifica `{dominio}/s/{código}`. Un servicio propio guarda `código → destino` y redirige. El código sale de una huella del link, así que el mismo link da siempre el mismo código y reimportar nunca cambia un QR.

## Constitution Check

| Principio | Efecto |
|---|---|
| I · Capas | Lógica pura en `src/lib/links` (sin servidor ni React); repositorio y servicio en `src/server/links` (`server-only`); la UI no importa servidor. |
| II · Regla crítica del QR | No cambia: una pieza con «Link del QR» no se acorta ni se genera. Acortar solo toca «Link del menú». El archivo del QR sigue direccionado por contenido: ahora el contenido es el link corto (estable). |
| III · Link estable | Se amplía: el link corto es otro link estable. **La constitución se actualiza** (III y VI) para listar `/s/{código}` como ruta pública. |
| IV · Salida vectorial | Sin cambios. |
| V · Validación | Destino validado en el servidor con `SafeHttpUrlSchema`; resultados por link (`created/reused/kept/invalid`), nada silencioso. |
| VI · Seguridad | Crear/editar con `withApiGuards`. La ruta pública solo redirige a destinos ya validados al crearlos y a los que solo una persona autenticada puede cambiar. Las claves `s/v1/*.json` no se sirven por la ruta de storage. |
| VII · Pruebas | Unitarias (código, normalización, servicio), integración (API y redirect), dom (formulario, importación) y E2E. |

## Decisiones técnicas

### D1 · Código determinista (FR-002 a FR-004)

`code(url, intento) = base31(sha256(url [+ "\0" + intento]))[0..8]` con el alfabeto `23456789abcdefghjkmnpqrstuvwxyz` (31 caracteres, 40 bits). Minúsculas para que dos códigos no colisionen en un sistema de archivos que no distingue mayúsculas (macOS). Para buscar el código de un link se calcula y se lee el registro: si existe con `originalUrl` igual → reutilizado; si existe con otro `originalUrl` → siguiente intento; si no existe → se crea con escritura condicional (`ifNoneMatch`) y, si perdió la carrera, se relee. Sin índice y sin base de datos.

### D2 · Repositorio como interfaz (FR-015)

```ts
interface ShortLinkRepository {
  get(code: string): Promise<ShortLink | null>;
  create(link: ShortLink): Promise<"created" | "exists">;           // nunca sobrescribe
  update(code: string, patch: { destination: string; at: string }): Promise<ShortLink | null>;
}
```

- **Hoy:** `ObjectShortLinkRepository` guarda `[prefijo/]s/v1/{código}.json` en el `StorageProvider` configurado (local, S3, R2 o Supabase Storage). Funciona sin infraestructura nueva.
- **Fase B:** `SupabaseShortLinkRepository` sobre Postgres (ver «Fase B»). No cambia ni el servicio ni las rutas ni la UI.
- `update` usa el número de `revision` para no pisar una edición simultánea (lee, compara, escribe; el hueco restante se acepta con un solo escritor y se cierra con la fila única de Postgres).

### D3 · Claves de storage

`keys.ts` gana `LINK_KEY_PATTERN` (`[prefijo/]s/v1/{código}.json`). `assertValidKey` acepta QR **o** link; `isValidKey` (lo que sirven `/api/storage` y `/api/qr/asset` y lo que reconoce `keyFromPublicUrl`) sigue siendo solo de QR. Así un registro de link nunca se sirve ni se confunde con un QR.

### D4 · Ruta pública `/s/{código}` (FR-006)

- `src/app/s/[code]/route.ts`, GET. Lee el registro, redirige 302 con `no-store`. Caché en memoria de ~30 s (el cambio de un destino se propaga en ese tiempo).
- `src/proxy.ts` excluye `s/` del `matcher` (si no, la autenticación de páginas bloquearía a los huéspedes).
- Código mal formado o desconocido: 404 sin cuerpo útil para sondeos.

### D5 · API (FR-009)

| Ruta | Método | Función |
|---|---|---|
| `/api/links/shorten` | POST | `{ urls: string[≤200] }` → `{ results: [{ url, status, shortUrl?, code?, message? }] }` |
| `/api/links/{code}` | GET | destino vigente, link original, fechas e historial |
| `/api/links/{code}` | PATCH | `{ destination }` → registro actualizado (historial + revisión) |

Límite: `RATE_LIMIT_LINKS_PER_MIN` (120 por defecto; 5000 filas = 25 llamadas).

### D6 · Dónde se acorta en la interfaz (FR-001, FR-011)

- Se añade `fetchShorten` al `Runtime` (como `fetchResolve`), inyectable en las pruebas.
- **Importación:** en `confirm()`, tras decidir qué filas entran y **antes** de `importRecords`. Un fallo total aborta la confirmación con «Reintentar».
- **Formulario:** `prepareDraft(draft)` acorta `menuUrl` antes de `add`/`save`. `add` y `save` no cambian.
- Un link inválido se deja como está: su error de validación ya lo marca.
- Los links propios se reconocen en el cliente (`isOwnLink`) para ahorrar llamadas; el servidor es la autoridad.

### D7 · Excel actualizado (FR-012)

`POST /api/records/excel` (guardado) recibe las piezas (`area … menuUrl`, `qrUrl` solo si es aportado), consulta el destino de cada código y devuelve un `.xlsx` con SheetJS (`XLSX.write`). Encabezados = `FIELD_LABELS`, que la importación ya reconoce, más «Link original (referencia)» (se ignora al importar). Botones: en el resumen de importación y en la barra de Piezas.

### D8 · Detección de duplicados

`menuUrl` forma parte de la clave de duplicados por defecto. Piezas con link corto contra filas con link largo no coinciden. Se documenta como limitación conocida y se resuelve en T-090 (consulta de solo lectura para comparar por destino).

## Fase B · Integración con la plataforma y Supabase (diseño)

Depende de la otra plataforma (roles, autenticación, proyecto de Supabase). Se implementa cuando existan las credenciales y el modelo de roles; esta fase solo fija el diseño para no cerrar puertas.

### B1 · Modelo de datos (Postgres)

```sql
create table public.short_links (
  code          text primary key check (code ~ '^[2-9a-hjkmnp-z]{8}$'),
  destination   text not null check (length(destination) <= 2048),
  original_url  text not null,
  revision      integer not null default 1,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index short_links_original_url_key on public.short_links (md5(original_url));

create table public.short_link_history (
  id          bigint generated always as identity primary key,
  code        text not null references public.short_links(code) on delete cascade,
  destination text not null,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);

create table public.qr_assets (
  storage_key  text primary key,        -- qr/v1/{sha256}.svg
  payload      text not null,           -- lo que codifica (link corto)
  svg_sha256   text not null,
  renderer     text not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
```

### B2 · Seguridad y roles

- RLS activado en las tres tablas. Lectura/escritura según los roles de la plataforma (p. ej. `producción` crea; `administrador` cambia destinos). La función que decide se escribe contra el modelo de roles real.
- El redirect `/s/{código}` es público pero **solo lee**, con una función `security definer` (o el rol de servicio en el servidor) que devuelve el destino de un código y nada más.
- Las imágenes de los QR van a un **bucket privado**; se sirven con una URL firmada de corta vida o a través de una ruta autenticada de la plataforma. Un «Link del QR» firmado caduca, así que **no** se usa como link permanente ni se escribe al Excel (ya es la decisión D8 de la spec).
- La clave de servicio nunca llega al navegador.

### B3 · Pasos

1. Implementar `SupabaseShortLinkRepository` (cliente `postgres`/`@supabase/supabase-js` solo en servidor) y elegirlo con `LINKS_REPOSITORY=supabase`.
2. Migración SQL versionada en `supabase/migrations/`.
3. Registrar cada QR generado en `qr_assets` (quién y cuándo).
4. Sustituir el acceso básico de la herramienta por la sesión de la plataforma (`AUTH_MODE=proxy` ya existe para esto).
5. Pruebas contra un Supabase local (`supabase start`) en CI.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El servicio de redirect cae y todos los QR dejan de funcionar | Es el mismo riesgo del link estable; hay que vigilar disponibilidad y mantener el dominio. Fase B: Postgres administrado; Workers como segundo despliegue. |
| R2 | Un destino mal editado rompe QR impresos | Historial con el destino anterior y aviso explícito al editar. |
| R3 | Redirección abierta | Solo personas autenticadas crean o cambian destinos; destino validado (`http(s)`, sin credenciales, no propio). |
| R4 | Sondeo de códigos | Espacio de 2^40 y 404 uniforme. |
| R5 | Cambio del dominio tras imprimir | Igual que el link estable: el dominio es permanente. |
| R6 | Colisión de códigos | Intentos deterministas y escritura condicional. |
