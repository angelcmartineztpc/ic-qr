# Plan de implementación: Módulo PULSE «QR Producción»

**Spec**: [spec.md](spec.md) · **Tareas**: [tasks.md](tasks.md)

## Resumen

Un subárbol `pulse/` autocontenido: arnés Vite (solo para desarrollar y probar), `src/` con la estructura de la guía (lo que se fusiona) y `supabase/` (SQL, 7 Edge Functions, pruebas contra Supabase local). La lógica pura del proyecto (QR, documento, Excel, esquemas, registros, estado) se movió a `pulse/src/services/qr-produccion/**` con sus pruebas; la UI se reescribió con un kit propio en CSS Modules; el servidor Node pasó a Edge Functions.

## Constitution Check (v1.2.0)

| Principio | Efecto |
|---|---|
| I · Capas | **No aplica tal cual** (enmienda 1.2.0): no hay `src/server` ni `server-only` en `pulse/`. Capas propias: `services/**` puro, `services/**/backend/**` solo de servidor (las funciones lo importan; los componentes no) y `supabase/functions/_shared` para lo que toca Deno o Supabase. *Ver T-045: sin ESLint que lo imponga todavía.* |
| II · Regla crítica del QR | Igual. Probado contra la función real: genera, sirve y reutiliza; verificación SSRF rechaza hosts internos. |
| III · Link estable | Igual; `VITE_QR_DOMAIN` (front) y `QR_PUBLIC_BASE` (funciones) en lugar de `NEXT_PUBLIC_QR_DOMAIN`. Redirect público 302 `no-store` en `qr-enlaces` y `qr-estable`. |
| IV · Salida vectorial | Igual (pdfkit + fontkit en Deno, PDF vectorial válido). Unir lotes con `pdf-lib` copia páginas sin rasterizar. |
| V · Validación | Mismos esquemas Zod en cliente y funciones; resultados por pieza; nada silencioso (avisos `PDF_MERGE_FAILED`, conflicto, sin conexión). |
| VI · Seguridad | JWT + `qr_tiene_acceso()`; RLS; límites y SSRF en `backend/net`; secretos en `supabase/.env` (no versionado). Rutas públicas: redirects y `GET qr-resolver/storage/{clave}.svg` (**ver Decisión abierta D6**). |
| VII · Pruebas | 1072 unitarias/DOM + 23 contra Supabase local. Las 3 pruebas con URLs de `/api/*` se actualizaron al comportamiento nuevo con igualdad exacta (no se debilitó nada). |
| Fuentes / QR en git | Fuentes en bucket privado `qr-fuentes`, no versionadas; los QR generados, en Storage. |

## Decisiones técnicas

- **D1 · Empaquetado de funciones.** El CLI de Supabase no resuelve los imports sin extensión del código compartido (`failed to read file … messages.es`) y el runtime local no aplicó el `import_map`. `supabase/build-functions.ts` empaqueta cada función con Bun y reescribe los especificadores (`npm:`, `jsr:`, `https:`); `config.toml` apunta a `dist/`. (`dist/` no se versiona.)
- **D2 · DB-first.** `RemoteProjectPersistence` (revisión optimista, debounce 1,5 s, reintentos, `online` → flush) sobre `qr_proyectos`; `StoreProvider` la compone con el autoguardado de IndexedDB. Al abrir manda la base, salvo caché local más nueva del mismo proyecto.
- **D3 · Exportación por lotes.** `EXPORT_MAX_RECORDS = 100` por llamada (techo de CPU); lotes múltiplos de la hoja (`piecesPerSheet`, mismo cálculo que el escritor) y unión de PDF en el cliente (`merge-pdf.ts`); fallback a ZIP de PDF por lote con aviso.
- **D4 · `sharp` → rasterizador propio** (TS puro) para verificar QR de terceros. **Límite:** la geometría saneada no conserva `stroke-linecap`/`linejoin`; un QR que solo se lee con remates redondos/cuadrados sale `undecodable` y la persona decide. Un servicio con `sharp` no lo arreglaría (la pieza se dibujaría igual sin remates). Arreglo completo = conservar `strokeLinecap` en schema, saneado, SVG y PDF (T-032).
- **D5 · Roles.** `qr_roles_del_usuario()` lee `user_roles` o `profiles.roles` (ambas variantes probadas en local); lleva TODO + `COMMENT ON FUNCTION` hasta ajustarse al esquema real de PULSE. Sin `RAISE NOTICE` (se evalúa por fila en RLS).
- **D6 · Decisión abierta.** La spec 011 decidió que las imágenes de los QR fueran accesibles solo con permisos. Aquí el SVG de un QR generado se sirve **público** (`qr-resolver/storage/…`) porque el `qrUrl` debe abrirse fuera de la app. Hay que decidir si se mantiene o se pasa a URLs firmadas / ruta autenticada (011 T-103).

## Relación con otras specs (las vi)

- **011 · Fase B (Supabase).** Colisión real: 011 diseñó `short_links`, `short_link_history` y `qr_assets` (`contracts/supabase-short-links.sql`) y las tareas T-100 a T-103. Esta spec las implementa con **otros nombres**: `qr_enlaces` (historial en `jsonb`, máx. 20) y `qr_activos`; y el redirect público usa una Edge Function con service role en vez de `resolve_short_link()` para `anon`. **No se edita 011**; T-044 pide decidir si 011 Fase B queda superseded por la 012 o se alinean los nombres.
- **F001 (propiedades).** Los datos de resorts y destinos viven hoy en `src/lib/resorts/properties.ts` y en `pulse/` en las tablas `qr_resorts` y `qr_destinos_resort` (sembradas desde ese archivo). **Riesgo de dos fuentes de verdad** si cambian los destinos en un lado; anotado en T-046.
- **F002, F003, F004.** Registro histórico de la rama `qr-api-created` (QR, etiqueta/exportación, URL estable); cubiertas por 002, 004/005 y 007. No colisionan: en `pulse/` esos comportamientos son los de 002, 004, 005 y 007 sobre Supabase.
- **`PENDIENTES.md`.** Verificaciones manuales sin hacer del producto original (Illustrator, taller, libros reales de Excel). Aplican también aquí al PDF unido: T-054.

## Dependencias nuevas (justificadas y aprobadas por el responsable)
`qr` (matriz del QR), `fflate` (ZIP), `zustand` + `zundo` (estado y deshacer), `idb-keyval` (caché local), `@dnd-kit/*` (reordenar piezas), `@tanstack/react-virtual` (listas grandes), `@xmldom/xmldom` (saneado de SVG), `pdf-lib` (unir PDF). Backend (Deno, `npm:`/`https:`): `pdfkit`, `fontkit`, SheetJS 0.20.3 desde su CDN oficial (la de npm es 0.18.5 con CVE conocidos). Falta el visto bueno del repositorio de PULSE (T-041).

## Estructura

```
pulse/
  .env.example  package.json  vite.config.ts  vitest.db.config.ts   (arnés)
  patch-qr-produccion.sql                 (= supabase/migrations/…_qr_produccion.sql)
  MIGRACION.md  PULSE_INTEGRATION.md  DESPLIEGUE.md (T-043)
  src/{pages,components,services,types}/…  (lo que se fusiona)
  supabase/{config.toml,functions/,migrations/,seed.sql,tests/,build-functions.ts,README.md}
```

## Verificación (en `pulse/`)
`bunx tsc --noEmit` · `bunx vitest run` · `bunx vite build` · `bun run build:functions` · `supabase start` + `supabase functions serve --env-file supabase/.env` + `bun run test:db`.
