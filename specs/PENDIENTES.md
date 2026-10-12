# Pendientes e incongruencias detectadas al documentar

Resumen de lo que salió al escribir las specs `001`–`008` (2026-10-09). Cada punto indica en qué spec está el detalle. Nada de esto impide usar la herramienta hoy; son verificaciones sin hacer y diferencias entre `docs/ARCHITECTURE.md` y el código.

## Verificaciones manuales sin hacer
- **Illustrator** (005, 004): abrir los archivos con `Archivo ▸ Abrir` y ejecutar `scripts/illustrator-check.jsx`. El script ya acepta mesas de trabajo de 70 × 70 mm.
- **Taller** (004): grabar `out/calibration.pdf` en el material real y anotar la versión de QR más densa que se lee. Los umbrales `warnModuleMm`, `minModuleMm` y 4.5 pt son estimaciones.
- **Libros reales** (003): `tests/fixtures/real/` solo tiene un README; nunca se probó con Excel 365, Google Sheets ni LibreOffice.
- **Storage real** (002): el PUT condicional y los metadatos contra Cloudflare R2 y Supabase reales siguen sin verificarse.
- **Docker y apagado** (008): `docker build`, `docker run --read-only`, `src/proxy.ts`, `src/server/boot.ts` y el 503 de `/api/health` en apagado no tienen prueba automatizada.
- **Licencias** (008, 004): falta confirmar con legal o compras que las licencias de Gotham y Address Sans Pro Cd cubren uso en servidor (Gotham, además, uso web).
- **Accesibilidad** (006): contraste AA y lector de pantalla real sin comprobar.

## Código que `ARCHITECTURE.md` describe y no existe (002, 001)
- Detección `QR_ASSET_CHANGED` al re-verificar, caché LRU por `qrUrl` + `ETag` y `EXPORT_VERIFY_EXISTS` (§S2.4–S2.5).
- `zundo` está en `package.json` pero no se importa; el deshacer de borrado usa un búfer de un solo borrado. `GuardedLink` y `useGuardedRouter` (§S6) no existen.
- `PersistedProjectSchema` fija `schemaVersion` en 2 y no migra versiones anteriores: las respalda y empieza vacío.
- La comprobación de glifos de la fuente es solo un aviso en el formulario, no se aplica a filas de Excel.

## Valores que difieren de la documentación
- Cuota de QR agotada: `quota-exceeded` por pieza, no HTTP 429 (002). Saneado de SVG: 20 000 y 512 KiB, no ≤ 2000 mm (002).
- Autoguardado a los 200 ms, no 500 (001). Importación acepta también `.csv` y `text/csv`; no hay límite de 2048 caracteres por celda (003).
- Nombre del ZIP `<fileName>.zip`, no `{fileName}_SVG.zip`; el SVG de una pieza lo genera el servidor, no el cliente (005).
- `ARCHITECTURE.md` §E.3, §E.5, §E.7 y §E.11 siguen con Gotham/Montserrat y 50 mm; §S4 coloca opciones del PDF en `/preview` (hoy en `/export`).

## Opciones que existen por API pero la interfaz no muestra (005)
`cutLine` (`rgb`/`spot`), `colorSpace` CMYK, `maxCols`, `maxRows`, `svg.textMode` y `svg.cutLine`. El PDF no trae capas con nombre; el SVG sí (`artwork`, `qr`, `text`).

## Decisiones abiertas
- **Dominio definitivo del QR** y coordinación del enrutamiento de `/api/qr/*` con las rutas actuales de Palace (007). El dominio queda grabado en cada pieza.
- Si los destinos de los resorts pasan de archivo a base de datos (007): hoy cambiar un destino requiere un deploy.
- Rutas `/api` sin guardas: el redirect, `GET /api/health` y `GET /api/storage/**` (con storage local). El redirect no limita peticiones ni valida el `Host` (007, 008).
- `/preview` en móvil: la arquitectura dice solo lectura; el código no lo impone (006).
- `PdfViewer` usa colores literales en clases de Tailwind; la constitución habla de `sx` y `style` (006).
- `playwright.config.ts` arranca con `npm`, mientras la constitución prefiere Bun (008).

## Cloudflare Workers (009)
- **Sin publicar:** funciona en `wrangler dev`; falta `wrangler login`, crear el bucket R2, subir la fuente con `bun run cf:fonts -- --remote` y desplegar.
- **No verificado en producción:** límites de memoria y CPU con exportaciones grandes, y el comportamiento de R2 real (`onlyIf.etagDoesNotMatch`).
- **No disponible allí:** verificar un QR existente (Link del QR); falla con un error visible. Opción futura: `resvg-wasm`.
- **Licencias:** subir Address Sans Pro Cd a Cloudflare es uso en servidor; falta confirmarlo con compras o legal.
- **Middleware de Next (`src/proxy.ts`):** OpenNext lo marca como experimental en Cloudflare; el 401 sin credenciales se comprobó en local.
