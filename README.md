# QR Production Generator

Herramienta interna para crear piezas físicas de metal de **50 × 50 mm** con datos de restaurante, mesa y un **QR vectorial**, y exportarlas como **PDF vectorial compatible con Adobe Illustrator** (y SVG por pieza).

La arquitectura completa, las decisiones y el plan por fases están en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Ese documento es normativo; su sección final, «Registro de decisiones», prevalece sobre el resto.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Arquitectura | ✓ aprobada (2026-10-06) |
| 2 | Scaffolding, infraestructura y guardas | ✓ |
| 3 | Modelo de dominio y validación | ✓ |
| 4 | Núcleo vectorial: QR, texto, escena, SVG y PDF | ✓ (falta la verificación manual en Illustrator: [docs/ILLUSTRATOR.md](docs/ILLUSTRATOR.md)) |
| 5 | QR y storage (regla crítica de extremo a extremo en el servidor) | ✓ |
| 6 | Estado, document builder y formulario manual | ✓ |
| 7 | Importación de Excel | ✓ (falta probar con libros reales de Excel 365, Google Sheets y LibreOffice: `tests/fixtures/real/`) |
| 8 | Editor visual (`/preview`) | ✓ |
| 9 | Exportación en el servidor (`POST /api/export`) | ✓ |
| 10 | Descarga con progreso y cancelación | ✓ |
| — | Link estable del QR por resort y servicio (`/api/qr/{resort}/{servicio}`) | ✓ (integrado desde `qr-api-created`; ver «Link estable del QR») |
| 11–12 | Testing integral, pulido | pendiente (siguiente: **Fase 11, testing integral y endurecimiento**) |

## Requisitos

- **Node.js ≥ 22.12** (producción: Node 24)
- **Bun 1.4.2** (gestor de paquetes recomendado). npm también funciona.
- **Gotham** instalada en la máquina (tipografía de las piezas; ver «Fuentes»).

## Instalación

```bash
cp .env.example .env.local      # valores de desarrollo; sin secretos reales
bun install                     # o: npm install
bun run fonts:setup             # copia Gotham a assets/fonts/gotham (o: npm run fonts:setup)
```

### Fuentes

Gotham tiene **licencia comercial** (Hoefler & Co.), así que sus archivos **no se versionan**. `bun run fonts:setup` los copia desde `~/Library/Fonts`. Para usar otra carpeta, define `FONTS_SOURCE_DIR=/ruta`. El script verifica el sha256 contra [`assets/fonts/gotham/manifest.json`](assets/fonts/gotham/manifest.json).

La **interfaz** usa Gotham (decisión del 2026-10-07; se publica en `/_next/static`, así que la licencia debe cubrir uso web). Los `.woff2` no se versionan: `bun run fonts:setup` los copia antes de `dev`/`build`. La tipografía de las **piezas** NO es Gotham: es **Address Sans Pro Cd Semibold**, la de la referencia `QR_Tropical_1M_Alimentos.pdf` (`assets/fonts/address-sans`, tampoco versionada; `bun run fonts:setup` instala ambas). La pieza `tropical-table` mide **70 × 70 mm** y reproduce el PDF de referencia. Las vistas previas de las piezas reciben el texto ya convertido en contornos desde el servidor.

## Scripts

Los nombres son iguales con Bun y con npm:

| Bun | npm | Qué hace |
|---|---|---|
| `bun run dev` | `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `bun run build` | `npm run build` | Build de producción (`output: standalone`) |
| `bun run start` | `npm start` | Servir el build standalone (`node .next/standalone/server.js`, siempre en modo producción) |
| `bun run lint` | `npm run lint` | ESLint (calidad + capas de la arquitectura) |
| `bun run typecheck` | `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `bun run test` | `npm test` | Vitest: proyectos `unit`, `dom` e `integration` |
| `bun run test:e2e` | `npm run test:e2e` | Playwright (escritorio y móvil 390 × 844) |
| `bun run hash-password` | `npm run hash-password` | Genera `BASIC_AUTH_PASSWORD_SHA256` |
| `bun run check:sheetjs` | `npm run check:sheetjs` | Avisa si hay una versión nueva de SheetJS en su CDN |
| `bun run render:sample` | `npm run render:sample` | Genera PDF y SVG de muestra y la hoja de calibración en `out/` |

> **Atención:** `bun test` ejecuta el runner propio de Bun, no Vitest. Usa siempre `bun run test`.

**Lockfile:** `bun.lock` es el único lockfile versionado. Con npm, `npm install` genera un `package-lock.json` local que está en `.gitignore`.

**Playwright:** la primera vez hay que descargar los navegadores con `npx playwright install chromium`.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las más importantes:

| Variable | Desarrollo | Producción |
|---|---|---|
| `AUTH_MODE` | `none` | `basic` o `proxy` (con `none` el servidor **no arranca**) |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD_SHA256` | — | usuario y SHA-256 de la contraseña (`bun run hash-password`) |
| `APP_ORIGINS`, `APP_ALLOWED_HOSTS` | localhost por defecto | **obligatorias** (CSRF y anti DNS-rebinding) |
| `STORAGE_PROVIDER` | `local` | `s3` (AWS S3, Cloudflare R2, Supabase, MinIO) |
| `STORAGE_PUBLIC_BASE_URL` | `http://localhost:3000/api/storage` | dominio público del bucket |
| `NEXT_PUBLIC_QR_DOMAIN` | vacío (usa el origen de la app) | **dominio permanente** que se graba en los QR; se fija al compilar |

Al arrancar, la configuración se valida con Zod (`src/server/config/env-schema.ts`). Si falta algo o es inseguro, el proceso termina mostrando **todos** los problemas a la vez. Los secretos admiten la variante `*_FILE` (Docker/Kubernetes secrets).

## Docker

```bash
bun run fonts:setup                                  # Gotham debe estar en el contexto de build
docker build -t qr-production-generator .
docker run --rm -p 3000:3000 --read-only --tmpfs /tmp \
  -v qr-data:/app/.data --memory=1g -e NODE_OPTIONS=--max-old-space-size=700 \
  --env-file .env.production qr-production-generator
```

Bun se usa solo para instalar dependencias; el build y el runtime corren en **Node 24** (`node:24-trixie-slim`, fijada por digest). Next.js solo documenta Node como runtime, y en la imagen `oven/bun`, `node` es un alias de Bun. La imagen corre como usuario `node`, expone `HEALTHCHECK` sobre `/api/health` y solo `/app/.data` es escribible.

## Estructura

```
src/
  app/          páginas (Server Components) y Route Handlers (api/)
  components/   UI (MUI + Tailwind), islas cliente
  lib/          núcleo isomórfico (dominio, QR, escena, SVG) — sin servidor ni React
  server/       solo Node: entorno, guardas HTTP, storage, Excel, PDF
  lib/resorts/  resorts, servicios y destinos del link estable del QR
  schemas/      Zod      types/  tipos de dominio      templates/  plantillas de pieza
assets/fonts/   Gotham (no versionada) + manifest
scripts/        utilidades (fuentes, contraseña, SheetJS)
tests/          integración, e2e, helpers
docs/           ARCHITECTURE.md, ILLUSTRATOR.md
specs/          features F001–F004 (ver specs/README.md)
.specify/       Spec Kit: constitución (memory/constitution.md), plantillas y scripts
```

Las reglas de capas (por ejemplo, que `components` y `lib` no puedan importar `server`) se imponen con ESLint.

## Link estable del QR

El QR se graba en metal y no se puede reimprimir barato, así que **no codifica el destino**: codifica `{dominio}/api/qr/{resortCode}/{servicio}` (por ejemplo `/api/qr/TGPC/pool`). Esa ruta responde `302` al destino vigente de [`src/lib/resorts/properties.ts`](src/lib/resorts/properties.ts), con `Cache-Control: no-store`; un resort o servicio desconocido da `404`. Cambiar un destino es editar ese archivo, sin reimprimir.

- En el formulario de pieza y en la importación, el selector **Resort + Servicio** rellena el «Link del menú» con esa URL estable.
- `NEXT_PUBLIC_QR_DOMAIN` debe ser el dominio **definitivo**: queda grabado en cada pieza. Vacío, se usa el origen actual de la app (solo para desarrollo).
- Es la única ruta `/api` pública (la abren los huéspedes al escanear); no acepta destinos arbitrarios, solo los de la lista.

## Seguridad (resumen)

Todo Route Handler se declara con `withApiGuards` (`src/server/http`), que comprueba en este orden:

1. Host permitido.
2. Autenticación.
3. `Content-Type` exacto y mismo origen (CSRF).
4. Rate limit.
5. Concurrencia (semáforo).
6. Tamaño del cuerpo.

Las páginas se autentican en `src/proxy.ts`. Las cabeceras de seguridad (CSP, `X-Frame-Options`, etc.) se definen en `next.config.ts`. Detalle completo en `docs/ARCHITECTURE.md` §S8.

## Cómo probar la Fase 2

```bash
bun run lint && bun run typecheck && bun run test && bun run build

# Servidor de producción con autenticación basic
H=$(printf 'una-clave-larga' | shasum -a 256 | cut -d' ' -f1)
NODE_ENV=production AUTH_MODE=basic BASIC_AUTH_USER=diseno BASIC_AUTH_PASSWORD_SHA256=$H \
  APP_ORIGINS=http://localhost:3000 APP_ALLOWED_HOSTS=localhost:3000 ALLOW_LOCAL_STORAGE_IN_PROD=true \
  PORT=3000 bun run start
curl -i localhost:3000/api/health                       # 200 {"ok":true}
curl -o /dev/null -w '%{http_code}\n' localhost:3000/   # 401
curl -I -u diseno:una-clave-larga localhost:3000/       # 200 + cabeceras CSP
NODE_ENV=production bun run start                       # se niega a arrancar y lista los problemas
```

## Cómo probar la Fase 3

```bash
bun run test:unit          # 170+ tests del dominio, sin navegador ni servidor
bun run test:coverage      # ≥ 90 % en lib/records, lib/layout y lib/document
```

Qué cubre (todo en `src/lib`, `src/schemas`, `src/types`, `src/templates`):

- **Regla crítica del QR** (`lib/records/qr-state.ts`): con Link del QR nunca se genera; un QR generado se reutiliza; si cambia el Link del menú queda *stale* y bloquea la exportación hasta decidir, con confirmación ligada que caduca.
- **Validación** (`lib/validation`): campos de texto libre; obligatorios Área, Mesa y Link del menú; URLs seguras (bloquea `javascript:`, `data:`, `file:`…); mensajes exactos del spec («Fila 18: Falta Link del menú»).
- **Duplicados** (`lib/records/duplicates.ts`): clave configurable y estrategias Mantener / Eliminar / Revisar; nada se borra en silencio.
- **Plantillas** (`src/templates`): TropicalTable con Gotham, `restaurant-default` y `custom-template` (guía en su README).
- **Empaquetado** (`lib/document/sheet.ts`): A4 por defecto → 3 × 5 = 15 piezas por página, 17 páginas para 248.
- **Editor** (`lib/layout`): límites de 50 × 50 mm, redimensionar, imantar y presets del QR.

## Cómo probar la Fase 4

```bash
bun run fonts:setup        # Gotham (una vez)
bun run test               # incluye PDF real con Gotham; sin Gotham esos tests se saltan
bun run render:sample      # archivos en out/ para abrir en Illustrator
```

Después sigue la guía [docs/ILLUSTRATOR.md](docs/ILLUSTRATOR.md): abre los archivos de `out/` y ejecuta `scripts/illustrator-check.jsx` dentro de Illustrator. Qué se verifica por código:

- **PDF vectorial:** 0 imágenes (ni objetos ni operadores de pintura), MediaBox A4 exacta (595.2756 × 841.8898 pt), cada pieza de 141.732 pt (50 mm), QR como un único path `f*`, texto en contornos (0 fuentes) o vivo (Gotham incrustada con ToUnicode y texto extraíble).
- **SVG:** `width="50mm" height="50mm" viewBox="0 0 500 500"`, XML bien formado, ids únicos, una capa por grupo y ninguna imagen, estilo ni script; el texto del usuario nunca inyecta elementos.
- **Rendimiento:** 1000 piezas (67 hojas) en menos de 10 s.

## Cómo probar la Fase 5

```bash
bun run test               # 490+ tests; incluye storage real, SDK de AWS y rutas
```

Con el servidor en marcha (`bun run build && PORT=3000 … bun run start`, ver «Cómo probar la Fase 2» para las variables) y `STORAGE_PROVIDER=local`:

```bash
A='-u diseno:una-clave-larga'; J='-H Content-Type:application/json -H Sec-Fetch-Site:same-origin'
# Sin Link del QR → se genera una sola vez y devuelve la URL pública
curl $A $J -X POST localhost:3000/api/qr/resolve -d '{"items":[{"recordId":"r1","menuUrl":"https://menu.example.com/tropical","expectedRevision":0}]}'
# Repetir → "reused"; nada nuevo en el storage
# Con Link del QR → nunca se genera ("failed", código unsafe-url)
# Verificar un QR existente (SVG): "existing-ok" y su contenido decodificado
curl $A $J -X POST localhost:3000/api/qr/resolve -d '{"verify":[{"recordId":"r2","qrUrl":"https://qr.cliente.com/m1.svg","menuUrl":"https://menu.example.com/tropical"}]}'
```

Los QR generados se guardan como `qr/v1/{sha256}.svg` (el mismo link siempre da el mismo archivo). Con S3, R2 o Supabase configura `STORAGE_*` en `.env` (ver `.env.example`); la ruta `/api/storage/*` solo existe con el proveedor `local`.

## Cómo probar la Fase 6

```bash
bun run test        # 660+ tests: estado, persistencia, acciones, QR en el cliente, interfaz (jsdom)
bun run test:e2e    # Playwright en escritorio y móvil (390 × 844) contra el servidor de producción
bun run dev         # y abre http://localhost:3000/editor
```

Qué se puede hacer en `/editor`:

- **+ Agregar nuevo:** formulario con validación en vivo y vista previa de la pieza (Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú y Link del QR; todos de texto libre). Sin Link del QR se genera uno al guardar; con Link del QR se verifica ese archivo y **no** se genera otro.
- **Navegar y editar:** «Pieza N de M», rejilla paginada, búsqueda y filtros por contador (Con QR, Necesitan QR, Con errores).
- **Duplicar, eliminar (siempre con confirmación y [Deshacer]) y reordenar:** arrastrando, con teclado, «Mover a…» u «Ordenar por…».
- **Descargar SVG** de una pieza lista (50 × 50 mm, texto en contornos).
- **Proyecto:** autoguardado en el navegador, guardar y abrir `.qrproj.json` (abrirlo no regenera ningún QR), una sola pestaña escritora (la otra queda en solo lectura con «Tomar el control»).

La vista previa la dibuja el servidor con Gotham (`bun run fonts:setup` antes de `dev` o `start`); sin las fuentes responde 503 con un mensaje claro.

## Cómo probar la Fase 7

```bash
bun run test        # 790+ tests: guard del contenedor, cabeceras, pipeline, API real con el worker, interfaz
bun run test:e2e    # incluye tests/e2e/import.spec.ts (escritorio y móvil) contra el servidor de producción
bun run dev         # y abre http://localhost:3000/import
```

En `/import` (también desde «Importar Excel» en la barra):

- **Subir un .xlsx o un .csv** (arrastrar o «Seleccionar archivo»; en el móvil abre el selector). El CSV puede separar con coma, punto y como tabulador, y estar en UTF-8 o Windows-1252. Cualquier otro formato (PDF, imagen, .xls, texto sin tabla) se rechaza con el motivo.
- **Link del menú común (opcional):** si el archivo no trae la columna o la trae vacía, se usa ese link en esas filas. El archivo nunca se guarda: el servidor lo lee en memoria, dentro de un worker con límite de memoria y de tiempo.
- **Resumen:** filas encontradas, válidas, con errores y duplicadas, y pestañas **Errores** («Fila 18: Falta Link del menú»), **Duplicados** y **Avisos**, filtrables y copiables.
- **Columnas:** se reconocen alias y erratas pequeñas («No. Mesa», «Link del menú (URL)»). Si falta una columna obligatoria o hay una ambigua, se abre «Confirma las columnas».
- **Duplicados:** Mantener, Eliminar duplicados o Revisar manualmente (un interruptor por fila); la clave de duplicados es editable.
- **Añadir o Reemplazar** el proyecto, y opcionalmente **importar las filas con error como piezas a corregir**.
- **Informe de errores (.csv)** y resultado guardado en el navegador: recargar no pierde las filas con error hasta que lo descartes.
- Al confirmar se crean las piezas y se lanza la resolución de QR en lote: con **Link del QR** se verifica ese QR y **no se genera otro**; sin él se genera uno nuevo.

Archivos reales: copia libros de Excel 365, Google Sheets o LibreOffice en `tests/fixtures/real/` (no se versionan) y `bun run test` los importa con la ruta real.

## El flujo: tres pasos

La interfaz es un **stepper**: **1 Piezas → 2 Diseño → 3 Exportar**. El logotipo vuelve al Inicio, que solo sirve para retomar el proyecto abierto o empezar uno (crear, importar o abrir un `.qrproj.json`).

| Paso | Ruta | Qué se hace |
|---|---|---|
| 1 · Piezas | `/editor` (e `/import`) | Crear o importar piezas, buscar, editar y comprobar el QR. |
| 2 · Diseño | `/preview` | Mover y redimensionar el QR y el texto, plantilla, deshacer. |
| 3 · Exportar | `/export` | Nombre, hoja, formato (PDF y ZIP de SVG), vista de hojas y **Descargar**. |

Cada paso termina en una barra fija con **Atrás** y **Siguiente**; los pasos 2 y 3 esperan a que haya piezas. En el móvil el Stepper se resume en «Paso N de 3».

## Cómo probar la Fase 8

```bash
bun run test        # 840+ tests (incluye la geometría, el estado y la pantalla /preview en jsdom)
bun run test:e2e    # Playwright: arrastre real con el ratón, teclado y 1000 piezas
bun run dev         # y abre http://localhost:3000/preview
```

En `/preview` (menú «Generar PDF»):

- **Mover y redimensionar** el QR (4 esquinas, siempre cuadrado) y el bloque de texto (8 manejadores) con el ratón o el dedo. Imán a los bordes, el centro, el margen de seguridad y la otra caja (6 px); reglas en mm y rejilla opcional de 1, 2 o 5 mm. **Esc** cancela el arrastre.
- **Teclado:** con una caja enfocada, flechas = 0,5 mm, Mayús = 5 mm, Alt = 0,1 mm. Cada caja anuncia sus coordenadas al lector de pantalla.
- **Coordenadas exactas** (X, Y, ancho, alto) en mm o cm; se validan al salir del campo y **nunca se corrigen en silencio**: si no caben, se explica por qué.
- **Posición del QR** (abajo centrado / izquierda / derecha / centro) y aviso de solape con «Ajustar bloque de texto».
- **Ámbito:** «Todas las piezas» o «Solo esta pieza»; con piezas personalizadas aparece «Aplicar también a ellas».
- **Plantilla:** cambiar de plantilla y ajustar texto, tamaño, alineación, color, peso, margen y visibilidad de cada línea, zona de silencio y color del QR; un valor no válido se rechaza con su motivo.
- **PDF:** nombre del archivo (por defecto con fecha y hora locales), hoja o una pieza por página, A4 / Carta / personalizada, márgenes, separación y sangrado, y el resultado en vivo («6 por página · 2 páginas» o por qué no cabe). Las hojas se ven en miniatura, virtualizadas.
- **Deshacer / rehacer** (Ctrl/⌘ + Z) del diseño, la plantilla y las opciones del PDF.

## Cómo probar la Fase 9

```bash
bun run test                                   # incluye tests/integration/export.test.ts (la ruta real, el storage real y el PDF/ZIP resultantes)
```

`POST /api/export` recibe las piezas ya proyectadas (`lib/export/build-request.ts`) y devuelve un **stream de frames** (`lib/export/frames.ts`): progreso, metadatos de cada archivo, trozos de 64 KB, avisos y `DONE`. Genera el **PDF vectorial** y, si se pide, el **ZIP de SVG** (`001.svg`, `002.svg`… numerado sobre la lista exportada). No sube nada al storage, no genera QR y no sale a la red: solo lee. Antes de dibujar comprueba que el QR de cada pieza es exactamente el archivo al que apunta; si una pieza está pendiente, desactualizada sin confirmar o con errores, responde 400 indicando cuál.

## Cómo probar la Fase 10

```bash
bun run test        # 900+ tests (acciones de exportación, cliente del stream, avisos)
bun run test:e2e    # incluye export.spec.ts y export-1000.spec.ts (descarga real de PDF y ZIP)
bun run dev         # /preview → «Descargar PDF»
```

En `/preview`, **Descargar PDF**:

1. Si hay QR pendientes o sin verificar, los **resuelve primero** (con progreso). Los QR que ya tienen Link del QR solo se verifican: nunca se genera otro.
2. Si alguna pieza bloquea (QR con error, desactualizado sin confirmar, datos con errores), un diálogo la **lista con su motivo** y ofrece **Ir a corregir** o **Excluir N piezas de esta exportación**. Las excluidas no viajan y el resto se numera 1…n; «Volver a incluirlas» las recupera.
3. Si el QR se solapa con el texto en alguna pieza, **pide confirmación**.
4. Muestra el progreso real: «Generando PDF…» (piezas), «Preparando descarga…» y «Descargando…» (MB), con **Cancelar**. El PDF se descarga solo; con «También un ZIP con un SVG por pieza», el ZIP se ofrece aparte («Descargar ZIP»).
5. Al terminar el proyecto cuenta como exportado («Cambios sin exportar» desaparece). Si la descarga se corta: «La descarga se interrumpió» con **Reintentar**; sin conexión, un mensaje claro.

Mientras se genera, cerrar o recargar la pestaña pide confirmación al navegador.

## Spec Kit (desarrollo guiado por especificaciones)

[Spec Kit](https://github.com/github/spec-kit) 1.1.1 está instalado en el repositorio para **Claude Code** (`.claude/skills/speckit-*`) y para **GitHub Copilot** (`.github/skills/speckit-*`); el default de la CLI sigue siendo Copilot (`specify integration use claude` lo cambia). La constitución del proyecto (`.specify/memory/constitution.md`) todavía es la plantilla: las reglas vigentes están en `docs/ARCHITECTURE.md`, que sigue siendo la fuente de verdad.

En Claude Code, los skills son `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-analyze`, `/speckit-checklist`, `/speckit-constitution`, `/speckit-converge` y `/speckit-taskstoissues`. Estado de la instalación: `specify integration status` (el aviso `unsafe-multi-install` es esperado: Copilot no está declarado compatible con otras integraciones).

