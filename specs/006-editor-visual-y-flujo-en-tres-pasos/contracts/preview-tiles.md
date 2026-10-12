# Contrato: POST /api/preview/tiles

Fuentes: `src/app/api/preview/tiles/route.ts`, `src/schemas/preview.ts`, `src/server/preview/render-tiles.ts`. Séptimo endpoint de `docs/ARCHITECTURE.md` §A.5.

## Guardas (`withApiGuards`)

- `Content-Type: application/json` exacto.
- Límite de peticiones: `RATE_LIMIT_PREVIEW_PER_MIN` (600 por minuto en `.env.example`); cuerpo máximo 1 MiB (1024 × 1024 bytes).
- Autenticación, Host y origen según el resto de rutas protegidas.

## Petición (`PreviewRequestSchema`, objeto estricto)

| Campo | Tipo |
|---|---|
| `templateId` | cadena `^[a-z0-9-]+$` |
| `templateOverrides` | `TemplateOverrides` (ver `data-model.md`) |
| `layout` | `ProjectLayout`; `layout.templateId` debe igualar `templateId` |
| `detail` | `"full"` (por defecto) o `"low"` (sin módulos ni glifos) |
| `tiles` | 1 a 48 elementos |

Cada tesela: `key` (1–200, clave de caché del cliente), `recordId` (1–64), `area`, `estacion`, `mesa`, `subgrupo`, `concepto` (≤ 2048), `menuUrl` (≤ 4096), `qr` (`QrSourceInfo`) y `qrUrl` opcional (≤ 4096). Los campos son tolerantes: se dibujan también piezas con errores de validación.

## Respuesta 200

`{ "tiles": { "<key>": { "svg": "<svg…>", "warnings": [{ "code": "…" }] } } }` con `Cache-Control: no-store`. Con `detail: "full"` el texto va en contornos; los avisos son los de composición (texto que no cabe, módulo pequeño, etc.).

## Errores

| Estado | Código | Causa |
|---|---|---|
| 400 | `VALIDATION_FAILED` | cuerpo no válido (hasta 10 incidencias con `path` y `message`), plantilla desconocida, `templateId` distinto del layout o ajustes de plantilla inválidos (`PreviewError`) |
| 503 | `FONTS_MISSING` | falta el archivo de fuente de las piezas en el servidor («ejecuta `bun run fonts:setup`») |
| 415, 429 y similares | de las guardas | Content-Type incorrecto, límite superado |

## Qué QR dibuja (`previewQrGeometry`)

Nunca genera ni sube nada:

- `generated`: la matriz de su `payload` (aunque el link del menú haya cambiado).
- `existing`: su instantánea verificada en storage; sin `snapshotKey`/`assetSha256`, instantánea ausente, dañada o de otro archivo: marcador (cruz gris).
- `none`: QR del `menuUrl` si es válido; si no, el marcador.

Pruebas: `src/server/preview/render-tiles.test.ts` (la parte de contornos se omite sin la fuente de las piezas). No hay test de integración de la ruta.
