# Plan de implementación: Rediseño UX/UI Unificado y Despliegue Persistente en Cloudflare Workers

**Spec**: [spec.md](spec.md)

## Resumen

1. **Sistema de diseño unificado (Fases 1 a 4)**: sincronización entre CSS variables (`src/app/globals.css`) y el tema de MUI (`src/app/_providers/theme.ts`) con identidad corporativa `#274C69`, superficies tonales Material 3 en modo oscuro (`#0a0e12`, `#121920`, `#1b242e`) y acento luminoso `#6B9BC3` para textos/focos en modo oscuro.
2. **Persistencia sin costo en Cloudflare Workers (`QR_KV`)**: adaptador `R2BucketLike` respaldado por **Cloudflare Workers KV** en `src/server/storage/r2.ts` cuando `QR_BUCKET` (R2) no está activo en la cuenta, garantizando que tanto los links dinámicos (`s/v1/{código}.json`) como los SVG de QR (`qr/v1/{sha256}.svg`) persistan entre instancias y despliegues sin costo (`$0`) ni tarjeta.
3. **Fuentes de piezas embebidas en build**: `scripts/embed-server-fonts.mjs` empaqueta `AddressSansPro-CdSemibold.woff2` en `src/server/fonts/embedded-fonts.generated.ts` (ignorado en Git) como respaldo de `fontsFromR2()` en `src/server/fonts/index.ts`.

## Decisiones técnicas

### D1 · Tokens semánticos y Modo Oscuro Tonal (`#274C69` + `#6B9BC3`)

- **Modo claro**: `--color-brand-primary: #274C69`, `--color-brand-accent: #274C69`, `--color-focus-ring: #274C69`.
- **Modo oscuro**:
  - Superficies tonales teñidas con el azul corporativo: `background.default = #0a0e12`, `background.paper = #121920`, `--surface-subtle-token = #161f28`, `--surface-elevated-token = #1b242e`, `divider = rgba(255, 255, 255, 0.08)`.
  - Botones sólidos y chips activos: fondo `#274C69` con texto `#ffffff` y borde interior luminoso `inset 0 1px 0 0 rgba(107, 155, 195, 0.35), 0 0 0 1px rgba(107, 155, 195, 0.28)`.
  - Textos de acento, enlaces y anillos `:focus-visible`: `#6B9BC3` (contraste `>= 6.48:1` sobre `#0a0e12` y `#121920`, cumpliendo WCAG AA).

### D2 · Por qué el QR daba «No encontrado» antes de `QR_KV` y cómo lo resuelve Cloudflare KV

- En Cloudflare Workers las peticiones se reparten entre múltiples instancias (*isolates*) en distintos centros de datos. Con un `Map` en memoria RAM, el link corto creado en una instancia (`POST /api/links/shorten` → `s/v1/{código}.json`) no existía en la instancia que atendía el escaneo desde el celular (`GET /s/{código}`), devolviendo `404 No encontrado`.
- Con el binding **`QR_KV`** (Cloudflare Workers KV) conectado en `wrangler.jsonc` y `src/server/storage/r2.ts`:
  - `put(key, value, options)` guarda el cuerpo y los metadatos (`contentType`, `etag`, `customMetadata`) en `QR_KV` de forma global y permanente.
  - Si `options.onlyIf.etagDoesNotMatch === "*"` (escritura condicional), verifica primero si la clave ya existe en `QR_KV` y no la sobrescribe.
  - `get(key)`, `head(key)`, `delete(key)` y `list({ prefix })` leen directamente de `QR_KV`, por lo que cualquier celular en cualquier red obtiene la redirección `302` al destino vigente (y refleja cualquier actualización hecha en `Cambiar destino`).

### D3 · Empaquetado privado de `AddressSansPro-CdSemibold.woff2`

- `scripts/embed-server-fonts.mjs` se ejecuta automáticamente al inicio de `bun run build`.
- Genera `src/server/fonts/embedded-fonts.generated.ts` (excluido en `.gitignore`) con los bytes en base64 de `assets/fonts/address-sans/*.woff2`.
- En `src/server/fonts/index.ts`, si el bucket no contiene objetos bajo `fonts/`, `fontsFromR2()` devuelve las fuentes embebidas en memoria para `NodeFontRegistry`.

