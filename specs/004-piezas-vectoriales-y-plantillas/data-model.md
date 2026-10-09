# Data Model: Piezas vectoriales y plantillas

Fuente de cada tipo: `src/schemas/template.ts` (Zod), `src/types/scene.ts`, `src/types/pdf.ts`, `src/types/layout.ts`. Unidades: geometría en mm, tamaños de letra en pt, tracking en milésimas de em (`docs/ARCHITECTURE.md` §E.2).

## Template (`TemplateSchema`)

| Campo | Contenido en `tropical-table` v2.0.0 |
|---|---|
| `id`, `name`, `version` | `tropical-table`, «Tropical · Mesa», `2.0.0` |
| `tile` | `width: 70`, `height: 70`, `safeMarginMm: 2`; `background` opcional (no declarado); `cornerRadiusMm` por defecto 0 |
| `fontDir`, `fonts` | `address-sans`; Address Sans Pro Cd, peso 600, archivo `AddressSansPro-CdSemibold.woff2` |
| `defaultLayout.content` | caja `x 4, y 5.493, width 62, height 33.9` |
| `defaultLayout.qr` | caja `x 22.606, y 39.424, width 24.788, height 24.788` (cuadrada) |
| `content` | `verticalAlign: "start"`, `vMetric: "cap"`, 5 líneas (tabla siguiente) |
| `qr` | `quietZoneModules: 0`, `foreground: #000000`; por defecto `background #FFFFFF`, `invert false`, `minModuleMm 0.45`, `warnModuleMm 0.6` |
| `shapes` | `frame`: rectángulo `x/y 0.0882`, `69.8236 × 69.8236`, trazo `#000000`, 0.5 pt |

Líneas de texto de `tropical-table` (`TextElement`, todas con `color #000000`, `align` por defecto `center`):

| id | texto | pt | tracking | `marginTopMm` | fit |
|---|---|---|---|---|---|
| `area` | `{{area}}` (mayúsculas) | 17 | −50 | 0 | shrink, mínimo 10 pt |
| `label` | `MESA – TABLE` | 11 | −40 | 2.268 | none |
| `mesa` | `{{mesa}}` (mayúsculas) | 22 | −50 | 1.695 | shrink, mínimo 12 pt |
| `ctaEs` | `CONSULTA EL MENU Y ORDENA EN LÍNEA` | 13.2 | −25 | 5.036 | shrink, mínimo 10 pt |
| `ctaEn` | `LOOK AT THE MENU AN ORDER ON LINE` | 13.2 | −25 | 1.54 | shrink, mínimo 10 pt |

Campos enlazables en `text`: `{{area}}`, `{{estacion}}`, `{{mesa}}`, `{{subgrupo}}`, `{{concepto}}`, `{{menuUrl}}`. `hideWhenEmpty` es `true` por defecto.

Otras plantillas registradas (`src/templates/index.ts`):

| id | tile | Notas |
|---|---|---|
| `restaurant-default` v1.0.0 | 50 × 50 mm, fondo `#FFFFFF` | imprime también Estación · Sub-grupo y Concepto; QR con zona de silencio 2 |
| `custom-template` v0.1.0 | 50 × 50 mm, fondo `#FFFFFF` | esqueleto de dos líneas para copiar (ver `src/templates/custom-template/README.md`) |

`DEFAULT_TEMPLATE_ID` es `tropical-table`.

## TemplateOverrides (`TemplateOverridesSchema`)

Ajustes por proyecto sobre la plantilla base: `items` (por id de línea: `text`, `sizePt`, `align`, `color`, `weight`, `marginTopMm`, `hidden`), `qr` (`quietZoneModules` 0–8, `foreground`) y `tile.background`. Lo estructural (elementos nuevos, fuentes, tamaño de la pieza) solo se cambia en código.

## Layout

Cajas `content` y `qr` en mm, con la base del proyecto y overrides por pieza (`ProjectLayout`: `templateId`, `base`, `overrides`). Avisos de layout: `OVERLAP`, `OUTSIDE_SAFE_MARGIN`.

## TileScene (`src/types/scene.ts`)

- `widthMm`, `heightMm`, `nodes`, `warnings`, `meta` (`recordId`, `templateId`, `templateVersion`).
- `SceneLayer`: `background | artwork | text | qr | cutline`.
- `SceneNode`: `rect` (opcional radio, relleno, trazo), `path` (`fillRule`, `title`), `text` (posición, base, tracking, ancho) y `qrExternal` (instantánea de un QR existente).
- Ids de nodo en `tropical-table`: `frame`, `qr-background`, `qr-code`, `text-area`, `text-label`, `text-mesa`, `text-ctaEs`, `text-ctaEn`; con línea de corte, `cutline-outline`.
- Avisos (`LayoutWarning`): `OVERLAP`, `OUTSIDE_SAFE_MARGIN`, `QR_MODULE_SMALL {moduleMm, level}`, `QR_NO_WHITE_BACKGROUND`, `TEXT_OVERFLOW {elementId, axis}`, `MISSING_GLYPH {elementId, char}`.

## SheetLayout y PageSlot (`src/types/pdf.ts`)

- `SheetLayout`: `pageMm`, `orientation`, `cols`, `rows`, `perPage`, `originMm` (esquina de la pieza del hueco 0, sin sangrado), `pitchMm`.
- `PageSlot`: `page`, `index`, `xMm`, `yMm`.
- Caso trabajado (A4 vertical, márgenes 10, separación 5, pieza 70): 2 × 3 = 6 por página, origen (32.5, 38.5) mm, paso 75 mm.

## Hoja de calibración (`src/lib/document/calibration.ts`)

16 `CalibrationTile`: `CALIBRATION_VERSIONS` 4–9 × {normal, invertido} (12) + `CALIBRATION_TEXT_SIZES_PT` 4.5, 5, 5.5, 6 (4). Cada pieza lleva su etiqueta (versión y tamaño de módulo en mm, o tamaño del texto).

## Fuentes (`assets/fonts/*/manifest.json`)

`family`, `version`, `license`, y por archivo: `weight`, `sha256`, `postscriptName` y, para Address Sans Pro Cd, `advances` (huella de anchos por 1000 em de `0`, `1`, `M`, `T`, `O`, `A`). Los `.woff2` no se versionan.
