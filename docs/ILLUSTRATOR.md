# Verificación en Adobe Illustrator

Puerta de aceptación de la Fase 4 (AC26–AC28): comprobar que los archivos son vectoriales y que Illustrator los abre con las medidas correctas. **Es una prueba manual**: Illustrator no se puede automatizar desde el repositorio.

## 1. Generar las muestras

```bash
bun run fonts:setup        # una vez: copia Gotham a assets/fonts/gotham
bun run render:sample      # escribe los archivos en out/
```

| Archivo | Qué es |
|---|---|
| `sample-sheet.pdf` | Hoja A4 con 15 piezas, **texto en contornos** (valor por defecto) |
| `sample-single.pdf` | Una pieza por página: cada página de 50 × 50 mm es una mesa de trabajo |
| `sample-live.pdf` | Texto vivo (Gotham incrustada) |
| `sample-cmyk-cutline.pdf` | CMYK y línea de corte en tinta plana `CutContour` |
| `sample.svg` / `sample-live.svg` | Una pieza, en contornos y con texto vivo |
| `calibration.pdf` | Hoja de calibración para grabar en el material (ver abajo) |

## 2. Abrir en Illustrator y ejecutar el script

1. `Archivo ▸ Abrir…` y elige `out/sample-sheet.pdf` (en el diálogo de PDF, página 1).
2. `Archivo ▸ Scripts ▸ Otro script…` y elige `scripts/illustrator-check.jsx`; selecciona el mismo archivo.
3. El informe debe decir **RESULTADO: OK**:
   - Imágenes rasterizadas: **0**; imágenes vinculadas: **0**.
   - Mesa de trabajo: 210 × 297 mm (hoja) o 50 × 50 mm (`sample-single.pdf`, `sample.svg`).
   - Trazados compuestos ≥ 1 por pieza (el QR) y una capa por grupo (`background`, `qr`, `text`).
4. Repite con `sample-single.pdf`, `sample.svg` y `sample-live.pdf`.

## 3. Comprobaciones a ojo

- [ ] Al seleccionar una pieza del `sample-sheet.pdf`, mide 50 × 50 mm (`Ventana ▸ Transformar`).
- [ ] El QR es **un solo trazado compuesto** (clic sobre él: se selecciona entero, sin cientos de cuadros sueltos).
- [ ] En `sample-live.pdf`, el texto es editable (si Gotham no está instalada, Illustrator avisa de la fuente faltante: es esperado).
- [ ] `sample.svg` abre con las tres capas y sin fuentes faltantes.
- [ ] Escanea el QR de la pantalla con un teléfono: abre `https://menu.example.com/...`.
- [ ] Opcional: abre `sample.svg` en Figma o Inkscape.

## 4. Hoja de calibración (taller)

`out/calibration.pdf` trae 16 piezas con el mismo link a distintos tamaños de módulo (QR versión 4 a 9, normal e invertido) y texto de 4.5, 5, 5.5 y 6 pt. **Grábala en el material real** y anota:

1. La versión de QR más densa que se lee con un móvil normal (la etiqueta de la pieza indica el tamaño del módulo en mm).
2. Lo mismo para el QR invertido (si se usa aluminio anodizado).
3. El texto más pequeño que se ve bien.

Con esos datos se ajustan en la plantilla `qr.warnModuleMm`, `qr.minModuleMm` y el tamaño mínimo de texto (hoy 0.60 mm, 0.45 mm y 4.5 pt: **estimaciones sin validar**).

## Limitaciones conocidas

- Illustrator abre **una página por vez** de un PDF de varias páginas (elige cuál en el diálogo).
- Con texto **vivo**, Illustrator necesita Gotham instalada para editar el texto sin sustituirla; con contornos (por defecto) no depende de ninguna fuente.
- Los SVG con texto vivo dependen de las fuentes del equipo que los abre.
