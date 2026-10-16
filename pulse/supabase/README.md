# QR Producción — backend en Supabase

Sustituye al servidor Node de la app Next.js (`src/server/**`, `src/app/api/**`). Tablas y Storage en Postgres, siete
Edge Functions (Deno), y toda la lógica pura **compartida con el frontend** en `src/services/qr-produccion/backend/**`
(probada con vitest, sin Deno ni Supabase). Este directorio solo contiene lo que toca Deno o Supabase.

```
patch-qr-produccion.sql              tablas, RLS, buckets, semillas   (../patch-qr-produccion.sql)
supabase/
  config.qr-produccion.toml          fragmento para config.toml (verify_jwt, import_map)
  functions/
    import_map.json  deno.json       mapa de importaciones (@/ → ../../src) y opciones de Deno; tsc NO los ve
    _shared/                         adaptadores: auth, cliente, storage, fuentes, pdfkit, SheetJS, DNS/fetch
    qr-resolver/  qr-exportar/  qr-importar-excel/  qr-enlaces/  qr-estable/  qr-vista-previa/  qr-logo/
  check-imports.ts                   `bun supabase/check-imports.ts`: el grafo de importaciones se resuelve
  smoke-test.ts                      `bun supabase/smoke-test.ts`: las funciones reales contra un Supabase simulado
                                     (necesita pdfkit, fontkit y xlsx resolubles, que hoy salen de node_modules de la raíz del repo de origen;
                                     la tipografía se lee de ../assets/fonts si existe, y si no se omiten exportar y vista previa)
```

## Funciones y rutas

Todas bajo `https://<ref>.supabase.co/functions/v1/<función>`. `JWT` = `Authorization: Bearer <access_token>` de la sesión de PULSE
y rol **Admin** o **QR Producción**. Los errores son siempre `{ code, message, requestId, details? }` con el mensaje en español.

| Función | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `qr-resolver` | `POST /` `{items, verify}` | JWT | Genera (o reutiliza) el QR de los registros **sin** Link del QR y verifica el de los que lo traen. **Un registro con Link del QR nunca genera uno nuevo** (se rechaza en el servidor, aunque el cliente lo pida). |
| `qr-resolver` | `GET /storage/{clave}.svg` | **pública** | SVG de un QR generado (el `qrUrl` debe abrirse fuera de la app). Solo claves con la forma exacta `qr/v1/{sha256}.svg`; inmutable y con CSP `sandbox`. |
| `qr-exportar` | `POST /` | JWT | PDF vectorial (pdfkit) y/o ZIP de SVG, como **stream de frames con progreso** (mismo protocolo que antes). Máx. `EXPORT_MAX_RECORDS` piezas por llamada. |
| `qr-importar-excel` | `POST /` (cuerpo = el archivo) | JWT | Importa `.xlsx`/`.csv`: guard del contenedor ZIP → SheetJS. Cabeceras `X-File-Name`, `X-Column-Mapping`, `X-Import-Truncate`, `X-Default-Menu-Url`. El archivo nunca se guarda. |
| `qr-enlaces` | `POST /shorten` · `GET`/`PATCH /links/{código}` · `POST /records-excel` | JWT | Acortador (idempotente, máx. 200), consulta y cambio de destino (`If-Match` → 409), Excel actualizado. |
| `qr-enlaces` | `GET /s/{código}` · `GET /api/qr/{resort}/{servicio}` | **pública** | 302 al destino vigente (la URL grabada en el QR). |
| `qr-estable` | `GET /{resort}/{servicio}` (también `/qr/…` y `/api/qr/…`) | **pública** | 302 al destino de `qr_destinos_resort`. |
| `qr-vista-previa` | `POST /` | JWT | Piezas dibujadas en contornos (la tipografía comercial nunca sale del servidor). Máx. 48 por llamada. |
| `qr-logo` | `POST /` (cuerpo = SVG) | JWT | Sanea el logo y devuelve su geometría. No guarda nada. |

**Dominio permanente.** El link corto y el estable quedan grabados en cada pieza impresa. Por defecto son
`https://<ref>.supabase.co/functions/v1/qr-enlaces/s/{código}` y `…/qr-enlaces/api/qr/{resort}/{servicio}`; si el dominio de los QR cambia, los
códigos ya impresos dejan de funcionar. Antes de imprimir, pon un dominio propio delante (proxy o dominio personalizado de Supabase) y fíjalo
en `QR_PUBLIC_BASE` (servidor) y `VITE_QR_DOMAIN` (frontend). Con ruta (`…/functions/v1/qr-enlaces`) o en la raíz, el código lo reconoce igual.

## Despliegue

```sh
# 1. Base de datos (revisa antes «AJUSTAR» en qr_roles_del_usuario: de dónde salen los roles de PULSE)
cp patch-qr-produccion.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_qr_produccion.sql
supabase db push

# 2. Rol: añade «QR Producción» a UserRole (types/index.ts), AuthContext y HomeRedirect (guía §6.3).

# 3. Tipografías (licencia comercial: NO van a git). Al bucket privado qr-fuentes, con la ruta que declara la plantilla:
#    qr-fuentes/address-sans/AddressSansPro-CdSemibold.woff2
#    (desde el panel de Storage, o con `supabase storage cp … --experimental`)

# 4. Secretos (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya los inyecta Supabase)
supabase secrets set QR_ALLOWED_ORIGINS=https://pulse.example.com QR_PUBLIC_BASE=https://qr.palace.example.com

# 5. Funciones (fusiona antes config.qr-produccion.toml en supabase/config.toml: verify_jwt = false)
supabase functions deploy qr-resolver qr-exportar qr-importar-excel qr-enlaces qr-estable qr-vista-previa qr-logo
```

Frontend (`.env`): `VITE_SUPABASE_URL` (ya existe en PULSE), `VITE_QR_DOMAIN` (dominio permanente) y, solo si las funciones viven en otro
host, `VITE_QR_FUNCTIONS_URL`. Los clientes usan `fetch` con el JWT de la sesión y no `supabase.functions.invoke`, porque la exportación es un
stream binario con progreso que `invoke` entregaría ya leído entero.

Si el CLI no encuentra `../../src` al empaquetar (el empaquetado del CLI puede limitarse a `supabase/`), copia la lógica junto a las funciones
y apunta el mapa allí: `cp -r src/services/qr-produccion supabase/functions/_vendor/` y en `import_map.json`
`"@/services/qr-produccion/": "./_vendor/qr-produccion/"` (y `"@/types": "./_vendor/types.ts"` con `cp src/types/index.ts`).

### Secretos y variables (todas opcionales salvo las que Supabase inyecta)

Se validan juntas al arrancar (`backend/config/env-schema.ts`); si algo está mal, el log lista **todos** los problemas.

| Variable | Defecto | Para qué |
|---|---|---|
| `QR_ALLOWED_ORIGINS` | vacío = `*` | Orígenes de PULSE para CORS (el JWT no es una cookie, así que `*` no abre nada que no abriera ya el token). |
| `QR_PUBLIC_BASE` | URL de `qr-enlaces` | Dominio permanente de los links cortos y estables. |
| `QR_STORAGE_PUBLIC_BASE` | `…/functions/v1/qr-resolver/storage` | Base del `qrUrl` de los QR generados. |
| `QR_KEY_PREFIX` | vacío | Prefijo de claves (`prod/`). Mejor un proyecto de Supabase por entorno: `qr_activos.content_hash` es UNIQUE en toda la tabla. |
| `QR_HOST_POLICY` / `QR_ALLOWED_HOSTS` | `public` | `allowlist` limita los hosts de «Link del QR» (`host` exacto o `.sufijo`). |
| `QR_FETCH_TIMEOUT_MS` / `QR_FETCH_MAX_BYTES` | 5000 / 524288 | Descarga de QR de terceros. |
| `QR_RESOLVE_MAX_BATCH` / `QR_VERIFY_CONCURRENCY` | 50 / 4 | Registros por llamada y verificaciones simultáneas. |
| `QR_MAX_NEW_OBJECTS_PER_HOUR` | 2000 | Cuota de QR nuevos (cuenta filas de `qr_activos` de la última hora: vale entre instancias). |
| `IMPORT_MAX_BYTES` / `_ROWS` / `_CELLS` / `_ENTRY_INFLATED` / `_TOTAL_INFLATED` | 10 MB / 5000 / 300 000 / 20 MB / 40 MB | Límites de la importación. |
| `EXPORT_MAX_RECORDS` | **100** | Piezas por llamada de exportación (ver «Límites»). |
| `EXPORT_TIMEOUT_MS` | 120000 | Tiempo máximo del stream. |
| `RATE_LIMIT_*_PER_MIN` | 30 / 10 / 12 / 600 / 120 / 600 | resolve / import / export / vista previa / enlaces / rutas públicas. |

## Realtime

Ninguna tabla lo necesita (no hay `ALTER PUBLICATION supabase_realtime`): el proyecto tiene un único escritor, los QR son inmutables y los links se
leen bajo demanda.

## Límites de las Edge Functions y qué se hizo con ellos

Valores de la documentación de Supabase que conozco (**compruébalos en tu plan**): CPU ≈ **2 s por petición** (la espera de red no cuenta), tiempo de
pared 150 s (gratis) / 400 s (de pago), memoria ≈ **256 MB**, paquete ≈ 20 MB.

**Medido (Bun en un Mac, no Deno en Supabase; el servidor real suele ser más lento):**

| Operación | Tiempo |
|---|---|
| 200 piezas, PDF de texto vivo | ≈ 0,65 s |
| 200 piezas, PDF en contornos + ZIP de SVG en contornos | ≈ 1,5–2,1 s |
| 48 piezas de vista previa (completa / miniatura) | ≈ 80 ms / 50 ms |
| Verificar un QR de terceros (sanear + rasterizar + decodificar) | ≈ 15–20 ms |

- **Exportación.** El peor caso (contornos) roza el techo con 200 piezas, así que `EXPORT_MAX_RECORDS` es **100** y el cliente (`export/batch.ts`) parte
  cualquier exportación mayor en lotes **equilibrados** de ≤ 100, una llamada por lote, y los junta en el navegador en **un ZIP**: un PDF por lote
  (`nombre-parte-01.pdf`…), o los SVG con su numeración global (`options.batch` de la petición), o, con «un PDF por Estación», una carpeta `parte-NN/` por lote.
  **Consecuencia de producto:** por encima de 100 piezas el PDF ya no es uno solo (no hay permiso para añadir una librería de unión de PDF y unirlos a mano sobre la salida de pdfkit es frágil). Si imprenta exige un solo PDF, hay que
  decidirlo (p. ej. fusión con una dependencia autorizada, o un worker fuera de las Edge Functions).
  El PDF y el ZIP se acumulan en memoria (≈ 0,1 MB por 100 piezas en texto vivo; ≈ 1 MB en contornos con ZIP): lejos de 256 MB.
- **Vista previa.** 48 piezas por llamada caben con holgura. El cliente ya agrupa y cachea.
- **Importación.** SheetJS corre en la propia petición (sin `worker_threads`): lo acotan el guard del ZIP (tamaño, celdas, inflado, ANTES de leer) y el
  techo de CPU de la plataforma. Un libro de 300 000 celdas puede agotar la CPU: la plataforma responde 546 y el cliente lo explica («necesitó más recursos…»). Si pasa, baja `IMPORT_MAX_CELLS`.
- **Verificar QR de terceros.** `QR_RESOLVE_MAX_BATCH` = 50 es prudente para generar; con muchas verificaciones por llamada (≈ 20 ms cada una) baja a 25.
- **Un solo isolate** ejecuta una petición a la vez por semáforo (`*_MAX_CONCURRENCY` = 1): evita sumar CPU/memoria de varias exportaciones; las demás reciben 429 «ocupado» sin cola.

### `sharp` → rasterizador propio

`sharp` es nativo y no existe en Deno. Solo servía para **verificar un QR de terceros**: rasterizar la geometría saneada y decodificarla con `qr/decode`.
Ahora `backend/qr/rasterize.ts` dibuja esa misma geometría (rects y paths con relleno o trazo, curvas y arcos) en TypeScript puro, sin antialiasing, y
la decodifica el mismo decodificador (`qr/decode.js`). Probado con QR propios y de terceros (trazos, un rect por módulo). Límites conocidos: sin
degradados, máscaras ni opacidad (la lista blanca de `sanitize-svg` ya los rechaza), sin uniones ni remates de trazo (un QR hecho con trazos muy
gruesos y esquinas redondeadas podría no decodificar: se informa `undecodable` y la persona decide). Alternativa si hiciera falta fidelidad total: `npm:@resvg/resvg-wasm`
(WASM; no probado). La normalización del logo no usaba `sharp`, solo el saneador de SVG.

### Protección SSRF sin `node:https`

`safe-fetch` conserva todo: solo `https:443`, sin credenciales, política de hosts, **todas** las IP resueltas deben ser públicas (`is-public-address.ts`
propio, con los mismos casos que ipaddr.js: mapeadas, NAT64, 6to4, metadatos 169.254.169.254, CGNAT…), nombres `localhost`/`.local`/`.internal` bloqueados
antes del DNS, redirecciones manuales (≤ 3) **revalidadas**, tiempo y tamaño acotados, sin compresión. **Lo que cambia:** Deno no permite fijar la
IP validada en la conexión de `fetch`, así que el nombre se **vuelve a resolver** al conectar (ventana de *DNS rebinding* de milisegundos). Mitigaciones: las IP se validan justo antes,
solo https:443, y las Edge Functions corren en una red sin acceso a servicios internos de tu infraestructura. Es un riesgo residual **aceptado y
documentado**, no eliminado. El DNS usa `Deno.resolveDns` si el runtime lo ofrece y, si no, DNS-over-HTTPS de Cloudflare (`makeResolver`).

## RLS y seguridad

- `qr_proyectos`: lectura y escritura del **propietario** o de quien tenga el rol Admin / «QR Producción» (el equipo ve y edita los proyectos de todos); crear exige el rol; borrar, ser propietario o Admin. La revisión la sube un trigger y solo un Admin reasigna propietario.
- `qr_activos`, `qr_enlaces`: lectura para el rol; **sin políticas de escritura**: solo las funciones (service role) escriben. El redirect público lee con service role; las tablas no se abren a `anon`.
- `qr_resorts`, `qr_destinos_resort`: lectura para el rol; escritura solo Admin.
- Buckets `qr-produccion` y `qr-fuentes`: privados. Las fuentes no se pueden leer desde el navegador.
- Las funciones usan service role **después** de comprobar el JWT (`auth.getUser`) y el rol (`qr_tiene_acceso()` evaluada como el usuario). El token se recuerda 30 s por instancia.

## Qué NO está verificado

- **Nada se ejecutó en Deno ni contra Supabase real** (no hay Deno ni CLI en esta máquina). Verificado: `bunx tsc --noEmit` y `bunx vitest run` limpios; las funciones se
  tipan (con un `Deno` falso) y se **cargan y recorren con Bun contra un Supabase simulado** (`bun supabase/smoke-test.ts`: auth, rol, generar/reutilizar QR, regla crítica,
  SVG público, verificación, acortar/redirect/PATCH/409, estable, logo, exportar con pdfkit + fontkit + la tipografía real, vista previa, importar un `.xlsx` real y uno hostil).
  El simulado imita el contrato HTTP de supabase-js pero no es Supabase: no prueba RLS, el SQL, los permisos de Storage, ni los límites del runtime.
- `deno.json` con `"unstable": ["sloppy-imports"]`: el código compartido de `src/` usa importaciones **sin extensión** (`./hash`, `@/…/schemas/api`), que Deno solo
  resuelve con esa opción. No sé si el runtime de Edge Functions la respeta. Si no, usa el empaquetado con Bun (`bun build supabase/functions/<fn>/index.ts --target=node --external pdfkit --external fontkit --external xlsx --external @supabase/supabase-js`)
  y despliega el resultado; `check-imports.ts` ya demuestra que el grafo se resuelve así.
- Que `import_map.json` pueda apuntar fuera de `supabase/` en `supabase functions deploy` (ver la nota de `_vendor` arriba).
- SheetJS por https (`cdn.sheetjs.com`, v0.20.3) y `npm:pdfkit` / `npm:fontkit` en Deno; woff2 (brotli) en fontkit bajo Deno.
- `Deno.resolveDns` en el runtime de Edge Functions (hay respaldo DoH), y `qr_roles_del_usuario()` contra la tabla real de roles de PULSE.
- Los tiempos de la tabla de arriba son de Bun, no de Deno.

## Riesgos abiertos

1. **Unir el PDF** por encima de 100 piezas (decisión de producto, arriba).
2. **Rate limit y semáforos en memoria de cada instancia**: con varias instancias el tope real es N veces el configurado. La cuota de QR nuevos sí es global (cuenta filas).
3. **DNS rebinding** residual (arriba).
4. **`StorageProvider.id`** solo admite `local|s3|r2`: `SupabaseStorageProvider` se declara `"s3"` (comparte contrato: PUT condicional y URL derivada). Ampliar el tipo en `types/index.ts` cuando se pueda.
5. **El dominio de los QR** debe ser permanente antes de imprimir (arriba).
6. **Contenido de `qr_proyectos.datos` hasta 25 MB**: un proyecto de 5000 piezas ronda varios MB y se escribe entero; si molesta, partir por registros (fuera de alcance).
7. Los cambios a tests de `src/components/qr-produccion/**` (3 aserciones de URL) los hizo este trabajo para reflejar las nuevas rutas; confírmalo con quien mantiene esos componentes.
