# Plan de implementación: Correcciones de la revisión de UX

**Spec**: [spec.md](spec.md)

**Rama**: `ux-correcciones`, creada desde `2ca58a9`. Contiene los commits de UX (`0268e2e`–`1df854d`) y el skill (`2ca58a9`), sin `9d28551`.

## Decisiones técnicas

### D1 · Separación del commit ajeno (R6)

- `9d28551` no entra en `ux-correcciones`. La rama nueva parte de `2ca58a9`, que es el padre de `9d28551`.
- No se toca `mejoras-ux`. Ese nombre ya está publicado en `origin` y contiene `9d28551` de `disenopr`. Reescribirlo o forzar cambios afectaría a otra persona.
- **Pendiente con el usuario**: el PR #1 (`mejoras-ux` → `main`) sigue apuntando a `mejoras-ux`, que incluye `9d28551`. Hay que decidir si se cierra y se abre uno nuevo desde `ux-correcciones`. Esta acción es visible fuera del repo, así que no se hace sin confirmación.

### D2 · Umbral de la prueba de 1000 piezas (R1)

- Antes de cambiar nada, se mide el tamaño real del PDF con la prueba e2e sobre `2ca58a9`. El resultado queda en la sección «Medición R1» de este archivo.
- Si el PDF supera `1_000_000` bytes, se restaura el umbral original y no hay causa que corregir.
- Si no lo supera, la causa probable es el texto vivo por defecto (`3055c2e`). En ese caso **no** se rebaja el umbral a ciegas: se fija el umbral en un valor que tenga margen sobre el PDF medido y se documenta por qué. La prueba seguirá detectando un PDF vacío o truncado.
- No se cambia el `textMode` por defecto para hacer pasar la prueba. Ese default es una decisión de producto.

### D3 · Texto condicional en `error.tsx` (R2)

- `error.tsx` está dentro de `AppProviders` (`src/app/layout.tsx:36`), así que puede usar `useSession((s) => s.persistence.status)`.
- Con `status === "unavailable"`: «Algo salió mal. Tu proyecto no se guarda en este navegador: descárgalo con «Guardar proyecto» antes de reintentar.»
- En los demás casos se mantiene el texto actual.
- Como `error.tsx` podría fallar si el error viene de `StoreProvider`, el uso de `useSession` va dentro de un `try` solo si la medición muestra que es posible. Si no, no se añade.

### D4 · Frase canónica del chip (R4)

- Canónica: **«Cambios sin descargar»**, la frase del código.
- Motivo: ya está en `BuilderToolbar.tsx:47` y en `EditorScreen.test.tsx:194`. Cambiarla exige tocar más archivos y reescribir pruebas sin ganar claridad.
- Se actualiza `docs/AUDITORIA-UX.md:122` y la sección U3 para que digan lo mismo.
- Si el usuario prefiere la frase de la auditoría, el cambio es de tres archivos.

### D5 · Documentación (R3)

- Se reemplazan en `docs/ARCHITECTURE.md` los textos antiguos por los vigentes de `RecordQrActions.tsx`:
  - «Regenerar QR» → «Crear un QR nuevo con el link actual»
  - «Mantener QR anterior» → «Imprimir el QR anterior (apunta al link viejo)»
  - «Usar de todos modos» → «Usar este QR aunque apunte a otra dirección»
  - «Reemplazar por QR generado por la app» → «Cambiar por un QR nuevo de esta app»
- Las etiquetas de Mermaid (`:603`, `:612`) se reescriben igual.

### D6 · Formato de imports (R5)

- Se quita la línea en blanco entre el bloque de `@/lib/...` y `./`, y los imports nuevos se ordenan junto a los de `@/lib`.

## Medición R1

- **Comando**: `bun run test:e2e -- tests/e2e/export-1000.spec.ts --project=desktop`.
- **Resultado**: 1 prueba pasa en 17.6 s. Descarga de 1000 piezas en 5.7 s, PDF de **0.9 MiB** (≈944 KB).
- **Comparación**: 0.9 MiB < 1 MB, así que el umbral original (`1_000_000`) no se cumple con el valor por defecto actual.
- **Causa**: `PDF_DEFAULTS.textMode` es `"live"` (`src/schemas/pdf.ts:20`), introducido en `3055c2e`. La prueba no fija `textMode`, así que usa el texto vivo.
- **Nota de medición**: se midió sobre el árbol de trabajo de `ux-correcciones`, que incluye R2 a R5. Esos cambios no tocan el contenido del PDF, así que no afectan la medición.
- **Decisión (D2)**: el umbral se mantiene en `500_000` y se documenta en `tests/e2e/export-1000.spec.ts`. Es ≈ la mitad del tamaño medido, lo que deja margen y sigue detectando un PDF vacío o truncado. No se restaura `1_000_000`, porque ese valor solo se cumplía con contornos y el texto por defecto ya no lo produce.

Antes de la medición, Playwright necesita instalar Chromium 1243 (en caché solo está 1228). Ver `tasks.md` T-000.

## Fases

1. **Registro**: `spec.md`, `plan.md`, `tasks.md`, `CHANGELOG.md`. Sin cambios de código.
2. **Medición**: T-000 y T-001. Sin cambios de código.
3. **Correcciones**: R2, R3, R4, R5 y R1 según la medición.
4. **Verificación**: typecheck, unit, lint y e2e completas.
5. **Cierre**: entrada en `CHANGELOG.md`, commit en `ux-correcciones`. Sin push ni PR hasta confirmación.
