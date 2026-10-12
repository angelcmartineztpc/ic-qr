# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipo de producción interno que prepara placas metálicas con código QR. Trabajan sobre todo en escritorio, con hojas de Excel/CSV de sucursales o mesas, y entregan el resultado a Illustrator / impresión.

## Product Purpose

QR Production Generator convierte registros capturados a mano o importados desde `.xlsx`/`.csv` en piezas de placa (70×70 mm) con QR vectorial, y exporta SVG por pieza, ZIP y un PDF vectorial listo para Illustrator. Éxito: el PDF sale idéntico al formato de referencia, sin retrabajo.

## Positioning

Salida de producción exacta: piezas vectoriales idénticas al formato de referencia (tipografía, medidas, marco, tinta fijos) y PDF listo para Illustrator.

## Operating Context

Flujo en tres pasos: Piezas → Diseño → Exportar. Importación de Excel/CSV (rechaza archivos incompatibles), editor visual de posición, exportación en servidor con progreso y cancelación.

## Capabilities and Constraints

- Un registro con "Link del QR" nunca genera un QR nuevo; sin link se genera una vez y se reutiliza.
- Tipografía de las piezas: Address Sans Pro Cd Semibold, tinta #000000 (negro puro, RGB), marco 0.5 pt; no modificable.
- Gotham solo para la interfaz; licencia web sin verificar.
- Interfaz en español.

## Brand Commitments

Gotham en la UI; piezas con Address Sans Pro Cd. Textos literales de la pieza: «CONSULTA EL MENU Y ORDENA EN LÍNEA» / «LOOK AT THE MENU AN ORDER ON LINE».

## Evidence on Hand

Referencia: `QR_Tropical_1M_Alimentos.pdf` (Descargas del usuario). No hay testimonios ni métricas.

## Product Principles

1. La fidelidad de la pieza manda sobre cualquier expresión de la UI.
2. Cada paso tiene un solo propósito; sin repetición entre pantallas.
3. Los errores de datos se muestran antes de exportar, nunca después.
4. La regla del QR existente es inviolable.

## Accessibility & Inclusion

WCAG AA; interfaz en español.
