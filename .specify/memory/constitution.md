# IC-QR (QR Production Generator) Constitution

Herramienta interna para producir piezas físicas de metal con datos de restaurante/mesa y un QR vectorial, exportadas como PDF y SVG compatibles con Adobe Illustrator. El documento normativo de diseño es [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md); su «Registro de decisiones» prevalece sobre el resto. Esta constitución fija las reglas que no se negocian al especificar, planificar o implementar cualquier feature.

## Core Principles

### I. Una sola fuente de verdad y capas estrictas
Cada concepto tiene un único dueño: plantilla = datos Zod + `TemplateOverrides`; layout = mm; render = `TileScene`; reglas de QR = `src/lib/records/qr-state.ts`.
- `src/lib/**` es núcleo puro e isomórfico: sin `fs`, sin `server-only` y sin React.
- `src/server/**` es solo Node y lleva `import 'server-only'` (storage, red, SheetJS, pdfkit, fuentes en disco, guardas HTTP).
- `src/components/**` y `src/lib/**` nunca importan `src/server/**`; ESLint lo impone (`no-restricted-imports`). Un cambio que necesite saltarse una capa se rediseña, no se silencia.

### II. La regla crítica del QR (NON-NEGOTIABLE)
- Con **Link del QR** presente, **nunca** se genera un QR: se verifica el archivo existente.
- Un QR generado se reutiliza (`qr/v1/{sha256}.svg`: el mismo link produce siempre el mismo archivo).
- Si cambia el Link del menú, el QR queda *stale* y bloquea la exportación hasta decidir, con confirmación ligada que caduca.
- **El servidor no confía en el cliente:** recalcula la exportabilidad y la identidad de cada QR. Los fallos son siempre por pieza y nunca provocan una generación de respaldo.

### III. El QR codifica un link estable
El QR grabado en el material no puede reimprimirse barato. Por eso **nunca codifica el destino**: codifica un link estable que redirige (302, `Cache-Control: no-store`) al destino vigente. Hay dos:
- **Por resort y servicio:** `{dominio}/api/qr/{resortCode}/{service}`, con destinos en `src/lib/resorts/properties.ts`.
- **Link corto del menú:** `{dominio}/s/{código}` (8 caracteres). **Todo «Link del menú» se acorta siempre**; el código sale de una huella del link, así que el mismo link da el mismo código, y el destino se cambia desde la aplicación sin tocar el QR (`specs/011-acortador-de-links/`). Los links propios (`/s/…` y `/api/qr/…`) no se vuelven a acortar.

El dominio (`NEXT_PUBLIC_QR_DOMAIN`) se graba para siempre: debe ser permanente. Estas rutas son públicas y sin autenticación (las abren los huéspedes al escanear); no aceptan destinos arbitrarios: el resort y el servicio salen de una lista cerrada y los destinos de un link corto solo los crea o cambia una persona autenticada, validados (`http(s)`, sin credenciales, nunca otro link corto propio). Las otras rutas `/api` sin guardas son `GET /api/health` y, solo con storage local, `GET /api/storage/**`.

### IV. Salida vectorial verificable
- El PDF es vectorial: 0 imágenes, páginas y piezas con medidas exactas en mm, QR como un único path, texto en contornos (o vivo con la fuente incrustada).
- El SVG por pieza cumple `width/height` en mm, ids únicos, una capa por grupo, y nunca imágenes, estilos ni scripts; el texto del usuario jamás inyecta elementos.
- Cualquier cambio en el pipeline (`src/lib/svg`, `src/lib/document`, `src/server/pdf`) conserva esas propiedades con tests y, cuando aplique, con la verificación de [`docs/ILLUSTRATOR.md`](../../docs/ILLUSTRATOR.md).

### V. Validación en cada frontera y nada silencioso
- **Estricta** (reglas de negocio) en HTTP, formulario, filas de Excel y exportación (Zod `safeParse`, 400 con issues).
- **Tolerante** (forma) al hidratar IndexedDB o abrir un archivo de proyecto: lo que no cumple reglas de negocio se conserva con `validationErrors`; lo que no tiene forma va a cuarentena por registro. Nunca se descarta un proyecto entero.
- Toda transformación o descarte produce un `Issue` o `Warning` visible. Los mensajes al usuario van en español.

### VI. Seguridad por defecto
- Todo Route Handler se declara con `withApiGuards` (host → auth → Content-Type y origen → rate limit → concurrencia → tamaño); las páginas se autentican en `src/proxy.ts`. Las únicas excepciones son los redirects de III (`/api/qr/{resort}/{servicio}` y `/s/{código}`), `GET /api/health` y `GET /api/storage/**` (este último solo con storage local).
- Con `AUTH_MODE=none` el servidor **no arranca** en producción. Los secretos nunca se versionan (`.env*`, salvo `.env.example`); admiten la variante `*_FILE`.
- Toda descarga externa pasa por `safeFetch` (https, IP públicas, tamaños y tiempos acotados); todo SVG externo se sanea con lista blanca y se rechaza, no se ignora.
- Los QR generados nunca se versionan en git.

### VII. Tests y calidad como contrato
- `bun run test` (Vitest: proyectos `unit`, `dom`, `integration`); **no** `bun test`, que usa el runner de Bun. E2E con Playwright (`bun run test:e2e`).
- TypeScript estricto: sin `any`, sin `as any`, sin `@ts-ignore` (`@ts-expect-error` solo con descripción), sin `alert/confirm`.
- No se borran, saltan ni debilitan tests o umbrales (cobertura ≥ 85 % en lib/server/schemas) para llegar a verde. Un test obsoleto se actualiza al comportamiento nuevo, conservando lo que verifica.
- Un cambio no está terminado hasta que `bun run lint`, `bun run typecheck`, `bun run test` y `bun run build` pasan.

## Restricciones adicionales

**Stack:** Next.js 16 (App Router, `output: standalone`), React 19, TypeScript, MUI + Tailwind v4, Zod 4, `qr` (matriz del QR), pdfkit, fontkit, SheetJS (`xlsx` desde su CDN), zustand + IndexedDB. Bun gestiona dependencias y ejecuta scripts; build y runtime corren en **Node 24** (Docker es la referencia). La app también se puede desplegar como **Worker de Cloudflare** (OpenNext, almacenamiento R2; ver `specs/009-cloudflare-workers/`), con lo que no está disponible allí: verificar un QR existente. `bun.lock` es el único lockfile versionado. Añadir una dependencia nueva requiere justificarla en el plan de la feature.

**Estilos:** MUI pinta los componentes solo a través del tema; Tailwind se usa para layout, espaciado y responsive. Sin literales de color en `sx`/`style` dentro de `src/components/**`; los tokens se definen una sola vez (tema MUI → `globals.css`). Referencia visual: `DESIGN.md` y `PRODUCT.md`.

**Fuentes:** Gotham (interfaz) y Address Sans Pro Cd (piezas) tienen licencia comercial: **no se versionan**. `bun run fonts:setup` las instala desde la máquina local y verifica su sha256 contra el `manifest.json` de cada familia; un archivo que no coincide con el manifiesto —o con la huella de anchos de Address Sans Pro **Cd**, que no es lo mismo que «SemiBold» de ancho normal— no debe usarse para producir piezas. Los archivos se guardan en `.woff2`.

**Código heredado:** la rama `qr-api-created` (`app/`, `lib/`, `data/`, `qrcode`, `pdf-lib`, `archiver`, `tailwind.config.js`) fue absorbida y reemplazada por `src/`; no se reintroduce.

## Ámbito del módulo PULSE (`pulse/`) — enmienda 1.2.0

Este apartado aplica **solo** al subárbol `pulse/` (el módulo para la plataforma PULSE; ver [`specs/012-modulo-pulse/`](../../specs/012-modulo-pulse/spec.md)). Fuera de `pulse/` rigen íntegros los apartados anteriores, incluidos «Stack» y «Estilos»: Next.js 16, MUI y Tailwind siguen siendo obligatorios en el resto del repositorio y no se relajan.

### Excepción de stack (solo dentro de `pulse/`)
Se autoriza Vite 7 + React 19 + react-router 6, CSS Modules con las variables de tema de PULSE, y Supabase (Postgres, Auth, Storage y Edge Functions en Deno). Sustituyen, **dentro de `pulse/`**, a Next.js, MUI + Tailwind y al servidor Node. Motivo: PULSE impone ese stack a los módulos que acepta (guía de integración).

### Reglas que aplican solo dentro de `pulse/`
Vienen de la guía de integración de PULSE y no cambian el contrato del código fuera de `pulse/`:
- **DB-first:** se persiste en Supabase **antes** de actualizar el estado local; IndexedDB es caché, no fuente de verdad.
- **Sin `console.log`** (solo `console.error` y `console.warn`).
- **Sin MUI, Emotion, Tailwind ni Next** en `pulse/`; solo CSS Modules con variables de tema. Sin literales de color salvo datos del dominio (p. ej. la lámina blanca de la pieza).
- Tipos en un único `src/types/index.ts`; páginas con `export default`; alias `@/`.
- **Dependencias nuevas** solo con la justificación y la autorización recogidas en el plan de la 012.
- Puerta de calidad de `pulse/`: `tsc --noEmit`, `vitest run` y `vite build`; y `bun run test:db` contra Supabase local para SQL, RLS y Edge Functions.

### Cómo se aplican los principios I–VII dentro de `pulse/`
- **I (capas):** `src/server/**` y `server-only` **no existen** en `pulse/`, y el principio I no aplica allí tal cual. Las Edge Functions de `pulse/supabase/functions/` siguen un esquema de capas propio (Deno + adaptadores en `_shared/`); la lógica pura vive en `pulse/src/services/qr-produccion/**` (sin React) y la de servidor, en `…/backend/**`, que los componentes no importan.
- **II, IV, V, VI y VII:** aplican sin cambios. En el servidor equivalen: la autenticación es el JWT de Supabase + `qr_tiene_acceso()` (en lugar de `withApiGuards`), la descarga externa pasa por el `safeFetch` de `backend/net`, y las rutas públicas son solo los redirects de III y `GET qr-resolver/storage/{clave}.svg`.
- **III (link estable):** el dominio se llama `NEXT_PUBLIC_QR_DOMAIN` fuera de `pulse/` y **`VITE_QR_DOMAIN`** (frontend) y `QR_PUBLIC_BASE` (Edge Functions) dentro; conviven, cada uno en su ámbito, y en ambos el dominio se graba para siempre y debe ser permanente.
- **Código heredado y `pdf-lib`:** la prohibición de reintroducir `qr-api-created` es sobre la **arquitectura** de esa rama (`app/`, `lib/`, `data/`, `archiver`, `tailwind.config.js`), **no sobre la librería `pdf-lib`**: `pdf-lib` puede usarse (ya es devDependency del repositorio y, en `pulse/`, se usa en runtime para unir PDF por lotes en el cliente).
- **Fuentes y QR generados:** las fuentes comerciales siguen sin versionarse (en `pulse/` van al bucket privado `qr-fuentes`) y los QR generados viven en Storage, nunca en git.

## Flujo de trabajo

- **Spec primero:** toda feature nueva pasa por Spec Kit (`/speckit-specify` → `clarify` → `plan` → `tasks` → `implement`, con `analyze` antes de implementar). Las features existentes están documentadas en [`specs/`](../../specs/) (`001`–`008`, más las anteriores F001–F004) y las fases del proyecto en `docs/ARCHITECTURE.md` §G.
- **Commits** en español, con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`, `merge:`), uno por cambio coherente. Las ramas largas se integran con `merge`, nunca descartando trabajo del otro lado sin dejarlo dicho en el mensaje.
- Los cambios en la regla del QR (II), el link estable (III) o el pipeline vectorial (IV) se revisan contra esta constitución antes de fusionarse.

## Governance

Esta constitución prevalece sobre otras prácticas del repositorio; `docs/ARCHITECTURE.md` detalla el *cómo*. Una enmienda se propone con `/speckit-constitution`, indica qué principio cambia y por qué, actualiza esta versión y migra los documentos afectados en el mismo cambio. Toda revisión debe verificar el cumplimiento de los principios I–VII; la complejidad añadida se justifica en el plan de la feature. Guía de ejecución para agentes: `AGENTS.md` y `CLAUDE.md`.

**Version**: 1.2.0 | **Ratified**: 2026-10-09 | **Last Amended**: 2026-10-16
