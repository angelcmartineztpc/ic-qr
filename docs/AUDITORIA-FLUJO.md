# Auditoría de usabilidad del flujo (Excel → Piezas → Diseño → Exportar)

Fecha: 2026-10-09 · Complementa [AUDITORIA-UX.md](AUDITORIA-UX.md) (accesibilidad y diseño) y [AUDITORIA-REDACCION.md](AUDITORIA-REDACCION.md) (textos). Aquí se revisa **el recorrido completo de una persona**, buscando lo que la haría perder tiempo, trabajo o confianza.

## Cómo se hizo

Con la skill UI/UX Pro Max (reglas de flujo: progreso, navegación atrás, recuperación de errores, subida de archivos, pérdida de datos, feedback de tareas largas) se **simularon recorridos reales** en Chrome contra la app compilada, con los **límites reales por defecto** del servidor (no los relajados de las pruebas):

| Recorrido | Qué se midió |
|---|---|
| A. Primer uso, de cero a PDF | clics, campos, tiempos, qué se ve en cada paso |
| B. Importar 60 filas con 3 errores y 2 duplicadas | lo que se ve sin hacer scroll, qué pasa al confirmar |
| B2. Volver a «Importar» tras terminar | qué muestra la pantalla |
| C. Archivos equivocados (PDF renombrado, imagen, Word, vacío, CSV con `;`, columnas con otros nombres) | mensajes |
| D/E. Atrás del navegador, recargar, cerrar con cambios | si se conserva el trabajo y si se avisa |
| F. 1600 filas | tiempo y fallos con el límite real de 30 lotes de QR por minuto |
| G. 400 piezas descargadas varias veces seguidas | tiempos y límite de 6 descargas por minuto |
| Móvil (390 px) | Exportar y Piezas |

**Límites de esta auditoría:** una sola persona simulada (sin conocer el proyecto), solo Chrome, red local (en Cloudflare o por el túnel los tiempos serán mayores) y sin usuarios reales ni pruebas con dedo en un teléfono físico.

## Lo que ya funciona bien (medido)

- **Primer uso:** de cero a PDF descargado en **7 clics y 3 campos**, unos 8 s (QR generado en menos de 1 s).
- Pedir el Link del menú vacío da un error claro junto al campo.
- **Recargar la página, ir «Atrás» del navegador y cerrar la pestaña con cambios** conservan el trabajo; al cerrar con cambios el navegador avisa.
- 62 piezas con QR listas en 0,9 s; 400 piezas descargadas en 2,6 s.
- Archivos equivocados (imagen, Word, vacío) reciben un mensaje que dice qué hacer.
- Se puede volver a cualquier paso desde el Stepper y los números de página/pieza siempre se muestran («Pieza 3 de 62»).

## Resumen

| Prioridad | Cantidad | Idea |
|---|---|---|
| Alta | 6 | Pérdida de tiempo o confusión en tareas que la gente hace siempre |
| Media | 8 | Fricción que se nota a la segunda o tercera vez |
| Baja | 3 | Pulido |

---

## Prioridad alta

### 1 · «Importar» queda fuera de la pantalla
Tras subir el Excel, el botón **«Importar 62 piezas»** está a 890 px de altura en una pantalla de 720: hay que pasar por el resumen, la lista de errores, los duplicados y las opciones. Los otros pasos tienen un pie fijo con la acción principal; este no. Quien no baja piensa que la importación no hace nada.
**Arreglo:** pie fijo (`StepFooter`) con «Importar N piezas» y un resumen corto («3 con error, 2 duplicadas»).

### 2 · Al volver a «Importar» se ve un resultado viejo y contradictorio
Después de importar 62 piezas, volver a `/import` muestra «Se importaron 62 piezas» y debajo **«Válidas: 0 · Duplicadas: 62»** (las piezas recién importadas cuentan como duplicadas de sí mismas). No hay selector de archivo: para subir otro hay que bajar hasta «Cerrar este resultado».
**Arreglo:** al terminar una importación, `/import` debe abrir limpio (con el selector) y, si se quiere conservar, mostrar la última importación como un resumen aparte y estático. Calcular los duplicados solo contra las piezas anteriores a la importación.

### 3 · Con más de ~1500 filas, parte de los QR falla y la persona tiene que reintentar
Con el límite real (30 lotes de 50 QR por minuto), importar **1600 filas** dejó **50 piezas sin QR** («Demasiadas solicitudes; vuelve a intentarlo en 1 s»). El servidor ya dice cuánto esperar y la app no lo usa. Con 5000 filas serían 100 lotes: unos 70 fallarían. Además existe un tope de **2000 QR nuevos por hora**: un Excel con más enlaces distintos no podrá completarse nunca en esa hora, y nada lo avisa antes de importar.
**Arreglo:** reintento automático respetando `Retry-After`; mostrar «Generando QR 1200/1600, tardará ~2 min» y avisar antes de importar si el archivo supera la cuota por hora.

### 4 · Agregar muchas piezas a mano es lento
- Desde Inicio, «**+ Agregar nuevo**» lleva a Piezas **sin abrir el formulario**: hay que pulsar «+ Agregar nuevo» otra vez (la misma acción dos veces).
- Al guardar una pieza el diálogo se cierra: para agregar 20 mesas hay que reabrir 20 veces.
**Arreglo:** que el botón de Inicio abra el formulario directamente; añadir «Agregar y crear otra» (conserva Área y Resort, limpia Mesa).

### 5 · En «Diseño» no se ve la pieza completa
En 1280 × 720 el lienzo queda cortado por el pie fijo y el aviso («QR generado» flota encima). Para ver el QR y sus medidas hay que bajar, y con ello se pierde de vista la barra de herramientas. Es la pantalla donde más se mira.
**Arreglo:** que el lienzo mida «alto de la ventana − cabecera − pie» (`max-height: calc(100dvh - 20rem)`) y que las notificaciones no tapen el lienzo.

### 6 · Al terminar la descarga no se dice qué sigue
Después de «PDF descargado correctamente» no hay ninguna indicación para abrirlo en Illustrator (Archivo ▸ **Abrir**, no «Colocar»), ni dónde quedó el archivo, ni cómo comprobar que el texto es editable. Eso fue lo más importante del proyecto y solo está en `docs/ILLUSTRATOR.md`. El aviso de la fuente aparece antes de descargar, pero no cuando hace falta.
**Arreglo:** tras descargar, un panel «¿Y ahora?» con 3 pasos y enlace a la guía.

---

## Prioridad media

### 7 · Importar: valores por defecto que sorprenden
- Los **duplicados se importan por defecto** («Mantener»): 60 filas + 2 repetidas = «Importar 62 piezas» sin preguntar.
- Las **filas con error no se importan** por defecto: el aviso final dice «Quedan 3 filas con error en el informe», pero no hay forma de corregirlas ahí.
**Arreglo:** por defecto «Decidir una por una» si hay duplicados; ofrecer «Corregir ahora» sobre las filas con error.

### 8 · Nombre de archivo por defecto poco útil
El PDF se llama `qr-production-2026-10-09-1637.pdf` aunque el proyecto tenga nombre. Con varios PDFs al día no se distinguen. La cabecera, además, muestra «Proyecto sin nombre» como si faltara algo.
**Arreglo:** `{nombre del proyecto}-{fecha}`; pedir el nombre al guardar, no mostrarlo como carencia.

### 9 · Archivo disfrazado → mensaje que despista
Un PDF renombrado a `.xlsx` dice «No encontramos una hoja o tabla con columnas reconocibles»: se leyó como CSV. La persona busca un problema en sus columnas, cuando el archivo ni es de Excel.
**Arreglo:** detectar firmas de otros formatos (`%PDF`, PNG…) y decir «Este archivo no parece un Excel o CSV».

### 10 · El formulario de pieza no ayuda tras un error
Al enviar con errores, «Agregar pieza» se **deshabilita** (gris) y el error puede quedar bajo el pliegue del diálogo. La skill pide un resumen de errores con foco al primer campo inválido.
**Arreglo:** dejar el botón activo; al pulsar, mover el foco y el scroll al primer campo con error y mostrar «Faltan 3 datos: Área, Mesa, Link del menú».

### 11 · Atajos y gestos invisibles
`Ctrl/⌘ + Z` solo aparece en un tooltip; mover el QR con flechas (Mayús = 5 mm, Alt = 0,1 mm) solo está en el nombre accesible; reordenar en móvil exige pulsación larga sin pista. Quien no los conoce edita con medidas a mano.
**Arreglo:** una línea de ayuda bajo el lienzo («Flechas: mover 0,5 mm · Mayús: 5 mm · Alt: 0,1 mm · Ctrl+Z: deshacer») y «Mantén pulsada una pieza para moverla» en móvil.

### 12 · Descargas repetidas: un caso sin aviso
Con el límite de 6 descargas por minuto, en una prueba el 8.º intento **no descargó nada ni mostró aviso**; en la repetición sí funcionó, así que **no está confirmado**. Conviene probarlo a mano.
**Arreglo:** asegurar un aviso «Espera 40 s para volver a descargar» y guardar el último PDF para descargarlo de nuevo sin regenerarlo.

### 13 · Trabajo solo en el navegador
Todo vive en IndexedDB del navegador. Después de importar 1000 piezas (horas de trabajo) nada recuerda guardar una copia en archivo; solo se avisa al salir. Borrar los datos del navegador, o abrir otro navegador o equipo, lo pierde.
**Arreglo:** tras importar o a partir de N piezas, un aviso discreto «Guarda una copia del proyecto» con botón.

### 14 · Primera vez sin guía ni plantilla
Inicio no explica qué es «Resort/Servicio», no ofrece una **plantilla de Excel descargable** ni un ejemplo, y no avisa de la fuente necesaria. Quien importa por primera vez adivina las columnas.
**Arreglo:** botón «Descargar plantilla de Excel» en Inicio e Importar; texto de ayuda de Resort/Servicio (ver auditoría de redacción).

---

## Prioridad baja

- **15 · Avisos flotantes:** tapan el lienzo en Diseño y chocan con el pie fijo en móvil. Moverlos sobre el pie o a la esquina superior.
- **16 · Móvil:** en Exportar, las opciones van antes de la vista previa y obligan a un scroll largo; la precisión de mm en el lienzo con el dedo es incómoda. Colapsar «Hoja y formato» por defecto en móvil.
- **17 · Segunda pestaña:** si se abre una segunda pestaña, queda en solo lectura (mensaje ya mejorado); conviene un botón «Cerrar esta pestaña» o «Pasar el control aquí» más visible.

## Orden sugerido

1. **Primero (impacto diario):** #1 pie fijo en Importar, #2 `/import` limpio, #4 «Agregar y crear otra» y botón de Inicio.
2. **Segundo:** #3 reintento automático de QR, #5 lienzo que cabe, #6 panel «¿Y ahora?».
3. **Después:** #7–#14, empezando por la plantilla de Excel (#14) y el nombre del PDF (#8).

## Corrección hecha durante esta auditoría

La etiqueta «Sangrado (margen extra para el corte)» que se añadió en la auditoría de UX se **cortaba** («Sangrado (margen extr…») en la columna de dos campos. Se cambió a «**Sangrado (corte)**».
