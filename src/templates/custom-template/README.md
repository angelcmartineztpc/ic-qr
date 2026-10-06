# Crear una plantilla nueva

1. Copia `src/templates/custom-template/` con un nombre nuevo (`src/templates/mi-plantilla/`).
2. En `template.ts` cambia `id` (solo minúsculas, números y guiones), `name` y `version`.
3. Ajusta `tile` (tamaño en mm), `defaultLayout` (cajas del QR y del texto en mm) y `content.items`.
   - Unidades: geometría en **mm**; tamaños de letra en **pt**; tracking en milésimas de em (como Illustrator).
   - `text` acepta literales y campos: `{{area}}`, `{{estacion}}`, `{{mesa}}`, `{{subgrupo}}`, `{{concepto}}`, `{{menuUrl}}`.
   - `fit: { mode: "shrink", minSizePt }` reduce el tamaño si el texto no cabe.
4. Regístrala en `src/templates/index.ts`.
5. `bun run test`: la plantilla se valida con `TemplateSchema` (cajas dentro de la pieza, QR cuadrado, fuentes declaradas).

Desde la interfaz el usuario puede ajustar textos, tamaños, alineación, color, peso y márgenes de cada línea,
y la zona de silencio y el color del QR (`TemplateOverrides`). Lo estructural (elementos nuevos, fuentes,
tamaño de la pieza) se cambia aquí, en código.
