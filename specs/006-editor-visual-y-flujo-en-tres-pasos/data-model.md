# Modelo de datos: editor visual y flujo en tres pasos

Fuentes: `src/schemas/geometry.ts`, `src/schemas/template.ts`, `src/schemas/preview.ts`, `src/lib/state/stores.ts`, `src/lib/state/history.ts`, `src/lib/state/project.ts`. Unidades: milímetros salvo que se indique.

## Persistido en el proyecto (IndexedDB y archivo de proyecto)

| Entidad | Campos | Reglas |
|---|---|---|
| `Box` | `x`, `y`, `width`, `height` | `width` y `height` positivos; el editor las guarda con 3 decimales |
| `Layout` | `qr: Box`, `content: Box` | el QR debe ser cuadrado («El área del QR debe ser cuadrada») |
| `LayoutOverride` | `qr?: Box`, `content?: Box` | misma regla de cuadrado para el QR |
| `ProjectLayout` | `templateId`, `base: Layout`, `overrides: Record<recordId, LayoutOverride>` | `resolveLayout` devuelve `base` mezclada con el override; `resetOverride` y `pruneLayoutOverrides` los limpian |
| `TemplateOverrides` | `items[id]`, `qr`, `tile` | ver abajo; por defecto `{ items: {}, qr: {}, tile: {} }` |

`TemplateOverrides`:

- `items[id]`: `text` (1–500), `sizePt`, `align` (`start`/`center`/`end`), `color`, `weight` (100–900, entero), `marginTopMm` (≥ 0), `hidden`.
- `qr`: `quietZoneModules` (entero 0–8), `foreground` (color).
- `tile`: `background` (color; es el «Fondo de la pieza»).

Todo override se revalida con `resolveTemplate(template, overrides)`; un peso no declarado por la plantilla se rechaza con mensaje.

## Solo de sesión

- `EditorUiState`: `scope` (`all`/`single`), `box` (`qr`/`content`), `showGrid`, `gridMm` (1, 2 o 5), `snap`, `unit` (`mm`/`cm`). Valores iniciales: `all`, `qr`, rejilla apagada, 5 mm, imán activo, `mm`.
- `EditorHistory`: pila de hasta 100 `EditorSnapshot` (diseño, `templateOverrides` y opciones de exportación). No incluye los datos de las piezas. Se vacía al abrir otro proyecto.
- `TilePreviewClient` (`src/lib/app/tile-preview-client.ts`): agrupa peticiones en ventanas de 20 ms por defecto, cachea por contenido (LRU, 400 entradas por defecto) y parte en lotes de 48.

## Geometría derivada (`TileSpec` de la plantilla activa)

`tropical-table`: pieza de 70 × 70 mm, `safeMarginMm: 2`; caja base del bloque `{x:4, y:5.493, width:62, height:33.9}` y del QR `{x:22.606, y:39.424, width:24.788, height:24.788}`.

Constantes del editor: `MIN_BOX_MM = 5`, paso de flechas 0,5 / Mayús 5 / Alt 0,1 mm, umbral de imán 6 px de pantalla, tolerancia de `detectPreset` 0,05 mm.

## Transiciones relevantes

- «Todas» -> escribe en `layout.base`; «Solo esta pieza» -> `layout.overrides[recordId]`.
- [Aplicar también a ellas] -> elimina la clave de la caja de los overrides que la tenían (`applyBaseToCustomized`).
- [Restablecer esta pieza] -> elimina el override completo de esa pieza.
- [Restablecer a la plantilla] -> `templateOverrides = { items: {}, qr: {}, tile: {} }`.
