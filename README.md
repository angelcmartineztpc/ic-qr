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
| 5–12 | QR y storage, builder y formulario, Excel, editor visual, exportación, descarga, testing, pulido | pendiente |

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

La interfaz usa Roboto (OFL, incluida en `src/app/_fonts`). Gotham nunca se envía al navegador: las vistas previas reciben el texto ya convertido en contornos desde el servidor.

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
  schemas/      Zod      types/  tipos de dominio      templates/  plantillas de pieza
assets/fonts/   Gotham (no versionada) + manifest
scripts/        utilidades (fuentes, contraseña, SheetJS)
tests/          integración, e2e, helpers
docs/           ARCHITECTURE.md
```

Las reglas de capas (por ejemplo, que `components` y `lib` no puedan importar `server`) se imponen con ESLint.

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
