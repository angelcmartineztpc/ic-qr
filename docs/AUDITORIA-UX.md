# Auditoría de UI/UX, redacción y accesibilidad

Fecha: 2026-10-09 · Alcance: las 5 rutas (`/`, `/editor`, `/preview`, `/export`, `/import`), el diálogo de pieza, el 404 y los textos del código · Criterios: skill UI/UX Pro Max (reglas de accesibilidad, táctil, formularios, navegación) y WCAG 2.2 AA.

## Cómo se hizo

| Prueba | Qué se midió |
|---|---|
| axe-core 4.14.0 (WCAG 2.0/2.1/2.2 A y AA + buenas prácticas) | 9 estados × 2 tamaños (escritorio 1280 px y móvil 390 px), con piezas reales cargadas |
| Capturas de pantalla | Las mismas pantallas, revisadas a mano |
| Medidas en el navegador | Tamaño de cada control interactivo y de cada texto |
| Teclado | Tab por `/editor`, `/export` y `/preview`; si el foco se ve y si el pie fijo lo tapa |
| Reflujo | Ancho de 320 px en las 5 rutas (desborde horizontal) |
| Lectura del código | Todos los textos visibles (formularios, avisos, diálogos, importación, exportación) |

Lo que **no** se pudo comprobar: lectores de pantalla reales (VoiceOver/NVDA), uso con dedo en un teléfono físico y navegadores distintos de Chrome.

## Resumen

La base es sólida. axe no encontró nada en 7 de 9 estados, no hay desborde horizontal ni a 320 px, el contraste automático pasa, hay enlace «Saltar al contenido», un solo `h1` por página, `lang="es"` y respeto a `prefers-reduced-motion`. Los problemas reales son pocos pero importantes: **el foco del teclado casi no se ve**, **el pie fijo puede tapar controles enfocados**, y varios **textos usan jerga o dejan la decisión sin explicar**.

| Prioridad | Cantidad |
|---|---|
| Alta | 5 |
| Media | 14 |
| Baja | 5 |

## Estado de las correcciones (2026-10-09)

Se aplicaron en la rama `mejoras-ux`. Tras los cambios, axe da **0 violaciones en los 9 estados × 2 tamaños** (antes: 2 tipos de violación), el pie fijo ya no tapa ningún control al navegar con Tab, y los 929 tests, el tipado y el lint pasan. Las pruebas e2e afectadas se actualizaron y pasan en escritorio y móvil.

| Hallazgo | Estado |
|---|---|
| A1 foco visible, A2 pie fijo, A3 tarjetas, A5 encabezados, A8 «Sin dato», A9 nota del botón, A10 aviso duplicado, A11 pasos bloqueados | Hecho |
| A4 tooltips | Hecho en la ficha de la pieza (el texto del estado del QR ahora es visible) |
| A6 objetivos táctiles | Hecho en botones de icono (mínimo 40 px) y logotipo; los enlaces largos de URL no se tocaron |
| A7 texto pequeño | Hecho en pistas del Stepper, «Paso N de 3», «Guardado» y ayudas de campo (14 px); los chips siguen en 13 px |
| R1 botones del QR, R2 jerga, R4 importar, R5 error y 404, R7 «Ir a» | Hecho |
| U1 móvil, U2 filtros, U4 aviso de la fuente | Hecho |
| R3 nombres de los pasos, R6 «Link»/«enlace», U3 (tono de «Cambios sin descargar»), U5 pie fijo en pantallas bajas, A12 | Pendiente: son decisiones de criterio; conviene confirmarlas con el equipo |
| «Descargar plantilla de Excel» (R4) | Pendiente: hay que preparar el archivo |
| «Tienes cambios sin guardar.» (R5) | Sin cambiar a propósito: tests y flujo lo usan como título; proponer «¿Salir sin guardar?» si se quiere |

## 1. Accesibilidad

### A1 · Alta · El foco del teclado casi no se ve
Los botones y el interruptor «Imán» no tienen contorno de foco (`outline: none`). En los botones solo aparece un halo tenue de Material UI, casi invisible en «Descargar PDF», y en «Imán» el foco no cambia nada visible. Incumple WCAG 2.4.7 (foco visible) y, sobre todo, 2.4.13.
**Arreglo:** una regla global en `src/app/globals.css`, por ejemplo `:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }`, y lo mismo en el tema MUI para botones, toggles y switches. Contorno de al menos 2 px y contraste 3:1 con el fondo.

### A2 · Alta · El pie fijo puede tapar el control enfocado
En `/export`, con Tab, «Texto en el PDF» y un campo numérico quedan **totalmente cubiertos** por la barra «Diseño / Descargar PDF». Quien navega con teclado pierde de vista dónde está. WCAG 2.2, 2.4.11.
**Arreglo:** `html { scroll-padding-bottom: 5rem; }` (la altura del pie), para que el navegador deje espacio al desplazar.

### A3 · Alta · Las tarjetas de pieza no se pueden activar por voz (axe: serious)
El `aria-label` de la tarjeta («Seleccionar la pieza M1 · Tropical») no empieza con el texto visible («M1 · Tropical»). Quien usa control por voz dice «clic M1 Tropical» y no funciona. WCAG 2.5.3. axe lo marca en las 3 tarjetas, en escritorio y móvil.
**Arreglo:** que el nombre accesible **contenga** el texto visible, por ejemplo `aria-label="M1 · Tropical, pieza 1: seleccionar"`, o quitar el `aria-label` y dejar que lo calcule el contenido. Archivo: `src/components/records/RecordCard.tsx`.

### A4 · Media · Información importante solo en tooltips
El estado del QR guarda en un tooltip datos que no están en ningún otro sitio: «El QR lee: …», «se imprimirá el QR anterior (confirmado)», «Se generará al guardar la pieza…». El tooltip cuelga de un `<span>` no enfocable: con teclado o con el dedo no se ve.
**Arreglo:** mostrar esa frase como texto visible bajo la etiqueta en la ficha de la pieza (`RecordDetail`) y dejar el tooltip solo como refuerzo.

### A5 · Media · Orden de encabezados en «Diseño» (axe: moderate)
Los acordeones usan `h3` sin un `h2` antes. Los lectores de pantalla pierden la jerarquía. **Arreglo:** usar `h2` en `Section` de `PreviewScreen.tsx`.

### A6 · Media · Objetivos táctiles pequeños
La guía recomienda 44 × 44 px. WCAG 2.2 AA exige mínimo 24 × 24, así que **todo cumple el mínimo**, pero estos están al límite o por debajo de lo cómodo:

| Control | Tamaño |
|---|---|
| Logotipo/inicio en móvil | 24 × 24 |
| Asa de arrastrar y menú ⋮ de cada tarjeta | 30 × 30 |
| Botones del visor de PDF (miniaturas, página, zoom) | 30–34 |
| Casilla «Página actual» | 48 × 26 |
| Enlaces con la URL del menú y del QR | alto 16–36 |
| Resto de botones y campos | 40 |

**Arreglo:** subir los controles de 30 px a 40–44 px con `padding`, y dar más altura de línea a los enlaces largos. Separación mínima de 8 px entre vecinos.

### A7 · Media · Texto de 12–13 px
Se usa 12 px en las pistas del Stepper («Crea o importa las piezas»), en «Guardado», en «Paso 1 de 3» y en las ayudas de campo; 13 px en los chips. Es legible pero cansa, y las ayudas de formulario son justo lo que hay que leer. **Arreglo:** mínimo 14 px para todo texto que explique algo; 12 px solo para etiquetas decorativas. (Los números de la regla del lienzo en «Diseño» son dibujo, no texto.)

### A8 · Media · Los valores vacíos se leen como «raya»
Las piezas sin Estación, Sub-grupo o Concepto muestran «—». Un lector de pantalla dice «raya» o nada. **Arreglo:** `<span aria-hidden>—</span><span className="sr-only">Sin dato</span>` en `RecordDetail.tsx`.

### A9 · Media · El botón «Siguiente» deshabilitado no explica por qué
Con 0 piezas, «Siguiente: Diseño» está deshabilitado y la razón («Agrega al menos una pieza…») es un texto aparte. Un botón deshabilitado no recibe foco, así que con teclado nadie se entera. **Arreglo:** `aria-describedby` hacia la nota, o no deshabilitar y mostrar el aviso al pulsarlo.

### A10 · Media · Estado de guardado anunciado dos veces
Hay un `aria-live` en la cabecera («Guardado») y otro en la barra («Guardado en este navegador»). Un lector de pantalla puede repetir el mensaje en cada guardado. **Arreglo:** un único `role="status"` y quitar el otro.

### A11 · Baja · Estado «bloqueado» de los pasos
Los pasos 2 y 3 sin piezas son un `<span aria-disabled>` sin explicación. **Arreglo:** añadir texto oculto «Disponible cuando haya piezas».

### A12 · Baja · Color y estado
Los chips ya llevan símbolo (✓ ⚠ ✕), así que no dependen del color. Bien. Solo conviene lo mismo en los contadores («Con errores: 0» es rojo solo si hay errores).

## 2. Redacción

Los textos están en español natural y casi siempre dicen **qué hacer**. Lo que falta es explicar la **consecuencia** y evitar jerga interna.

### R1 · Alta · Decisiones sobre el QR sin explicar qué pasa
Botones como «Regenerar QR», «Mantener QR anterior», «Usar de todos modos», «Reemplazar por QR generado» enfrentan a la persona a una decisión crítica (el QR impreso no se puede cambiar) sin decir el efecto.

| Hoy | Propuesta |
|---|---|
| Regenerar QR | Crear un QR nuevo con el link actual |
| Mantener QR anterior | Imprimir el QR anterior (apunta al link viejo) |
| Usar de todos modos | Usar este QR aunque apunta a otra dirección |
| Reemplazar por QR generado | Cambiar por un QR nuevo de esta app |

Y un texto breve junto a los botones: «El QR que ya imprimiste no cambia. Crear uno nuevo solo afecta a lo que imprimas a partir de ahora.»

### R2 · Media · Tecnicismos sin definir

| Hoy | Problema | Propuesta |
|---|---|---|
| Imán | Jerga de diseño | Ajustar a guías (imán) |
| Sangrado | Término de imprenta | Sangrado (margen extra para el corte) y ayuda «0 si no lo necesitas» |
| Clave de duplicados | Abstracto | Qué campos hacen que dos piezas cuenten como la misma |
| Cuarentena / Registros que no se pudieron leer | Opaco | Piezas dañadas apartadas |
| Tomar el control | ¿De qué? | Editar aquí (la otra pestaña pasará a solo lectura) |
| Cambios sin exportar | «Exportar» sin contexto | Aún no has descargado el PDF |
| Guardado en este navegador | No dice el riesgo | Guardado en este navegador (si borras los datos del navegador se pierde: guarda también un archivo de proyecto) |
| QR reutilizado (ya existía) | Aviso confuso | Este QR ya estaba generado y se usó el mismo |
| Páginas / Rejilla | No es obvio | Una por una / Todas a la vez |
| Texto vivo / Contornos (para fabricación) | «Para fabricación» no dice qué cambia | Texto editable (necesita la fuente instalada) / Texto convertido a dibujo (no se puede editar, se ve igual en cualquier equipo) |

### R3 · Media · Un mismo concepto con tres nombres
El primer paso se llama «Piezas de producción» (Inicio), «Tus piezas» (título) y «Piezas» (Stepper). El segundo, «Diseño» y «Diseña la pieza». **Arreglo:** una sola palabra por paso en navegación y títulos («Piezas», «Diseño», «Exportar») y descripción distinta debajo.

### R4 · Media · La pantalla de importar se lee como un bloque
Un único párrafo de 14 px junto al área de arrastre mezcla límites, separadores y columnas: «Máximo 10 MB y 5000 filas. Si es un .csv, puede separar con coma, punto y coma o tabulador. Columnas: Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú y Link del QR.»
**Arreglo:** una lista corta y una línea que marque lo obligatorio.
- Obligatorias: **Área, Mesa y Link del menú**.
- Opcionales: Estación, Sub-grupo, Concepto y Link del QR.
- Límite: 10 MB y 5 000 filas.
- Y un enlace «Descargar plantilla de Excel» (hoy no existe y quitaría la duda más común).

Además, «Resort/Servicio» aparece antes del archivo sin decir que es opcional, y la frase «El QR se genera con el link estable de este resort y servicio» se repite dos veces en el flujo.

### R5 · Media · Páginas de error muy secas
- **Error:** «Ocurrió un error inesperado.» Falta decir que **el proyecto sigue guardado** y qué hacer. Propuesta: «Algo salió mal. Tu proyecto sigue guardado en este navegador. Pulsa Reintentar; si se repite, guarda el proyecto en un archivo y avisa al equipo.»
- **404:** solo «Página no encontrada» y un botón. Propuesta: «No encontramos esta página. Puede que el enlace esté mal escrito o ya no exista.»
- **Diálogo de salida:** el título «Tienes cambios sin guardar.» no es una pregunta. Propuesta: «¿Salir sin guardar?» con el mensaje «Los cambios de esta pestaña se perderán.»

### R6 · Baja · Consistencia de términos
«Link» y «enlace» conviven; «Sub-grupo» (campo) frente a «subgrupo» (código); «Pieza» y «Registro» en mensajes de cuarentena; botones con y sin «+» («+ Agregar nuevo» vs «Agregar pieza»). **Arreglo:** una mini guía de estilo (Link, Sub-grupo, Pieza) y aplicarla de una vez.

### R7 · Baja · Campo «Ir a»
En «Diseño» el campo se llama solo «Ir a». Propuesta: «Ir a la pieza n.º».

## 3. Usabilidad y orden visual

### U1 · Alta · En móvil los botones principales se parten mal
En 390 px «+ Agregar nuevo» se divide en 3 líneas y «Importar Excel» en 2; la barra se ve apretada. **Arreglo:** apilar los dos botones a todo el ancho, o acortar a «+ Agregar» y «Importar», con `white-space: nowrap`.

### U2 · Media · Los contadores parecen etiquetas, no filtros
«Total: 3 · Con QR: 3 · Necesitan QR: 0 · Con errores: 0» son botones que filtran la lista (están bien marcados con `aria-pressed`), pero nada lo sugiere. **Arreglo:** anteponer «Filtrar:» o una línea «Toca un contador para filtrar».

### U3 · Media · «Cambios sin exportar» llega antes de que se entienda
Aparece junto a «Guardado» desde la primera pieza. Parece una alarma, y en realidad solo dice que falta descargar. **Arreglo:** mostrarla solo cuando ya haya algo que exportar y con tono neutro.

### U4 · Media · Ayuda del PDF en la esquina
La nota de «Texto vivo» (necesita la fuente instalada) es la información más importante de la pantalla y está en 12 px, bajo un selector. **Arreglo:** pasarla a un aviso visible (`Alert` informativo) cuando se elige «Texto vivo», con el efecto concreto: «Si no tienes la fuente, Illustrator la sustituirá y el texto cambiará de aspecto.»

### U5 · Baja · Móvil: barra y pie con mucho espacio ocupado
Con 2 filas de controles y el pie fijo, el contenido útil en pantallas bajas es menos de la mitad. **Arreglo:** que el pie no sea fijo por debajo de 700 px de alto, o reducir su altura.

### U6 · Baja · Lo que ya funciona bien
- Un solo flujo de tres pasos con progreso visible y «Paso N de 3».
- Estado vacío con acción clara («Aún no hay piezas» + dos botones).
- Errores del formulario junto al campo, con texto concreto («El área es obligatoria») y no solo en rojo.
- Vista previa viva de la pieza al escribir y vista previa del PDF antes de descargar.
- Confirmaciones en vez de `confirm()`; avisos de error que no desaparecen solos.
- Reflujo correcto a 320 px y diálogo a pantalla completa en móvil.

## 4. Orden de trabajo sugerido

1. **Hoy (30–60 min):** A1 y A2 (dos reglas de CSS), A3 y A5 (cambios de una línea), U1.
2. **Esta semana:** R1, R2 y R5 (textos), A4, A8, A9, U2–U4.
3. **Cuando se pueda:** A6, A7, R3, R4 (incluida la plantilla de Excel), R6.

Después de aplicar: repetir axe, volver a pasar Tab por `/export` y probar con VoiceOver (Safari) los diálogos de pieza.

## 5. Evidencia

Capturas, resultados de axe (`axe.json`) y scripts de medida: en la carpeta de trabajo de la sesión (`scratchpad/audit`). No forman parte del repositorio.
