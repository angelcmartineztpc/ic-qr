# F003 — Etiqueta láser (SVG) + POST /api/export

**Status:** Draft (decisiones incorporadas) · **Owner:** Angel C. Martinez · **Scope:** lógica + API, sin UI · **Depende de:** F001, F002

## Problem
Producir etiquetas para grabado láser (una por spot) y exportarlas en lote como ZIP. Vector puro: sin `<text>`, sin fuentes, QR como un solo trazado.

## Decisiones (usuario)
1. QR = `buildServiceUrl(property, service)` (resort + servicio). **No lleva número de spot**; el número solo va como texto.
2. `service` obligatorio: `"pool" | "restaurant"`. Sin `zone`.
3. Dependencias autorizadas e instaladas: `archiver`, `fontkit` (verificado: lee `.woff2` y devuelve trazados).
4. Tamaño físico (mm) pendiente del proveedor → parámetro configurable (`widthMm`, default provisional 100 mm, cuadrada).

## Referencia
`specs/reference/QR_Tropical_1M_Alimentos_page-0001.jpg` (cuadrada, negro sobre blanco), de arriba abajo:
1. Nombre de estación (grande, bold) — "TROPICAL"
2. Tipo (pequeño) — "MESA – TABLE" | "CAMASTRO – SUNBED"
3. Número (muy grande, bold) — "M1"
4. Texto bilingüe 2 líneas (bold, mayúsculas) — "CONSULTA EL MENU Y ORDENA EN LÍNEA" / "LOOK AT THE MENU AN ORDER ON LINE"
5. QR centrado, zona de silencio

## lib/label.ts
`generateLabel(input: LabelInput): Promise<string>` → SVG string.

```ts
interface LabelInput {
  stationName: string;
  spotType: SpotType;
  number: number;          // M39 (mesa) / C39 (camastro)
  service: Service;        // elige el texto bilingüe
  url: string;             // buildServiceUrl(...)
  widthMm?: number;        // configurable; viewBox escala, width/height en mm
}
```

**Reglas de salida:**
- Cero `<text>`, `<tspan>`, `font-family`, `@font-face`; todo texto → `<path>` (glifos de Gotham vía fontkit, `public/fonts`).
- QR: un único `<path>` (módulos unidos), `#000` sobre fondo `#fff`, zona de silencio ≥ 4 módulos. Módulos de `QRCode.create`, sin servicios externos.
- Monocromo; determinista; `LabelError` tipado.

## POST /api/export
Body JSON: `{ propertyId, stationName, spotType, startNumber, endNumber, service }`.

OK: 200 `application/zip`, un SVG por spot, nombres ordenados con padding (`M001.svg` … `M039.svg`, ancho según `endNumber`).

| Caso | Respuesta |
|---|---|
| `propertyId` inexistente | 404 `{ error, code: "PROPERTY_NOT_FOUND" }` |
| Campo faltante/tipo inválido, `service` inválido, `start > end`, enteros < 1 | 400 `INVALID_INPUT` |
| `end-start+1` > **500** | 400 `LIMIT_EXCEEDED` |
| Fallo interno | 500 `INTERNAL` |

`ExportError` con `code` tipado.

## Acceptance criteria
- [x] TS strict, sin `any`.
- [x] SVG sin `<text>` ni fuentes (test por regex).
- [x] QR = un único `<path>`; zona de silencio verificada.
- [x] El QR decodifica a la URL de servicio (sin número).
- [x] ZIP con N archivos, orden lexicográfico = numérico.
- [x] 501 → `LIMIT_EXCEEDED`; 500 → OK; `propertyId` inválido; `start > end`.

## Open questions
1. **Gotham condensada:** la referencia usa un cut condensado; `public/fonts` solo tiene Gotham normal (Thin…Ultra). Supuesto: Gotham-Bold con escala horizontal ~0.8 (transform sobre trazados). ¿Hay Gotham Condensed?
2. **Texto bilingüe de `pool`:** solo se conoce el de `restaurant`. Supuesto pool: "ESCANEA PARA ORDENAR EN LA ALBERCA / SCAN TO ORDER AT THE POOL" (placeholder).
3. La referencia dice "AN ORDER" (typo, debería ser "AND"). ¿Se replica o se corrige a "AND"? Supuesto: corregir.
4. Tipo para camastro: "CAMASTRO – SUNBED" con guion largo (como en la referencia).
5. Nombre de estación largo: supuesto reducir escala hasta ancho máximo; si no cabe, `INVALID_INPUT`.
6. Licencia de Gotham para trazados (confirmar derechos).
7. Los `resortCode`/base `pool` de F1 siguen siendo placeholders.
