# Auditoría de redacción, instrucciones y tono

Fecha: 2026-10-09 · Complementa [AUDITORIA-UX.md](AUDITORIA-UX.md) (que ya corrigió el foco, el contraste de nombres y varios textos). Aquí se revisa **solo lo escrito**: etiquetas, ayudas, avisos, confirmaciones, errores y el vocabulario.

## Cómo se hizo

- Reglas de la skill UI/UX Pro Max aplicadas a textos: `error-clarity` (causa + cómo arreglarlo), `error-recovery` (camino de salida), `input-helper-text`, `input-labels`, `confirmation-dialogs`, `success-feedback`, `empty-states`, `compact-label-overflow`.
- Lectura de **todos** los textos que ve una persona: componentes, avisos y confirmaciones (`builder-actions`, `import-actions`, `export-actions`, `editor-actions`), catálogo de errores del QR, mensajes de importación de Excel y mensajes de la API que llegan a pantalla.
- Se comprobó en el código cada error de concordancia citado (con archivo y línea).

No se probó con personas reales. Los textos propuestos son una guía; conviene que alguien del equipo (diseño u operaciones) los valide.

## Resumen

El tono general es bueno: tuteo, frases cortas, verbos de acción («Agrega», «Elige», «Revisa») y casi siempre se dice qué hacer. Los textos de importar Excel (`file-issues.ts`) son los mejores del proyecto: dicen la causa y la solución. Los problemas están en cuatro sitios:

1. **«Guardado» significa dos cosas distintas** y eso confunde (hallazgo 1).
2. **Mensajes técnicos que llegan a la persona usuaria** (comandos, nombres de cabeceras, «hash», «clave», «instantánea») (hallazgo 2).
3. **Errores sin camino de salida**: dicen qué falló pero no qué hacer (hallazgo 3).
4. **Cinco errores de concordancia** («Se importaron 1 piezas») y vocabulario mezclado (hallazgos 4 y 5).

| Prioridad | Hallazgos |
|---|---|
| Alta | 1, 2, 3 |
| Media | 4, 5, 6, 7 |
| Baja | 8, 9 |

---

## 1 · Alta · «Guardado» tiene dos significados

La app guarda sola en el navegador (chip «Guardado en este navegador»), pero la confirmación al salir dice «**Tienes cambios sin guardar.**». Una persona lee: «¿no estaba guardado?». En realidad se refiere a **no haber guardado un archivo de proyecto**. Además hay un tercer estado, «Cambios sin descargar» (PDF).

| Hoy | Propuesta |
|---|---|
| Chip «Guardado en este navegador» | Se guarda solo en este navegador *(sin cambios)* |
| Título «Tienes cambios sin guardar.» | **¿Salir sin guardar el proyecto en un archivo?** |
| Mensaje «Se perderán 1 pieza.» | Tus piezas están guardadas en este navegador, pero no en un archivo. Si borras los datos del navegador, se pierden. |
| Botones «Empezar sin guardar» / «Reemplazar sin guardar» / «Abrir sin guardar» | «Empezar de todos modos» / «Reemplazar de todos modos» / «Abrir de todos modos», más un botón «Guardar archivo primero» |
| «Guardar proyecto (.qrproj.json)» | Guardar proyecto en un archivo |

**Regla de vocabulario:** *guardado automático* = navegador; *guardar proyecto* = archivo `.qrproj.json`; *descargar* = PDF o SVG.

## 2 · Alta · Mensajes técnicos que llegan a pantalla

La skill pide mensajes que una persona no técnica entienda. Estos no cumplen:

| Dónde | Hoy | Propuesta |
|---|---|---|
| `api/preview/tiles`, exportación | «Faltan las fuentes de las piezas en el servidor (ejecuta \`bun run fonts:setup\`)» | «El servidor no tiene las fuentes de las piezas. Avisa a quien administra la aplicación.» (el comando va al registro, no a la pantalla) |
| `server/http/guards.ts` | «Content-Type no admitido; se espera application/json», «Origen de la petición no permitido», «Host no permitido» | Mostrar «No se pudo completar la acción. Recarga la página e inténtalo de nuevo» y dejar el detalle en el registro |
| `api/import/excel` | «X-Column-Mapping no es base64url de un JSON válido», «X-Import-Truncate debe ser un entero…» | «No se pudieron aplicar las columnas elegidas. Selecciona el archivo otra vez.» |
| `qr/identity.ts` | «El hash del QR no corresponde a su contenido», «La clave del QR no corresponde…» | «El QR de la pieza M1 no coincide con su archivo guardado. Vuelve a generarlo desde la ficha de la pieza.» |
| `qr/resolve.ts` | «Hay un archivo distinto en la clave del QR (…a1b2c3): no se reutilizó ni se sobrescribió» | «Ya existe otro archivo con el mismo nombre interno; por seguridad no se tocó. Avisa al equipo con esta referencia: …» |
| `qr/resolve.ts` | «Este registro tiene Link del QR: se usa ese recurso y no se genera un QR nuevo» | «Esta pieza usa el QR del Link del QR; no se genera otro. Si quieres uno nuevo, vacía ese campo.» |
| `api/qr/asset` | «La instantánea no existe / está dañada / no es válida» | «No se encontró la copia guardada del QR» / «La copia guardada del QR está dañada» |
| `qr/resolve` | «Máximo 100 registros por llamada» | «Se pueden generar hasta 100 QR a la vez. Hazlo por partes.» |
| `export-actions.ts:70` | «Error al generar el PDF: error desconocido» | «No se pudo generar el PDF. Inténtalo de nuevo; si se repite, avisa al equipo.» |
| `guards.ts:152` | «Error interno. Referencia: abc123» | «Algo salió mal en el servidor. Inténtalo de nuevo; si se repite, comparte esta referencia con el equipo: abc123.» |
| Avisos de composición | «El texto «content» no cabe en la pieza» (nombre interno del elemento) | «El bloque de texto no cabe en la pieza. Acórtalo o agranda el bloque.» |

## 3 · Alta · Errores que dicen qué falló, pero no qué hacer

La regla `error-clarity` pide **causa + solución**. Estos se quedan a medias:

| Código | Hoy | Propuesta |
|---|---|---|
| `timeout` | «El servidor del QR tardó demasiado en responder.» | … «Inténtalo de nuevo en unos minutos.» |
| `too-large` | «El archivo del QR es demasiado grande.» | «El archivo del QR pesa demasiado (máximo 512 KB). Usa un SVG más ligero.» |
| `encode-failed` | «No se pudo generar el QR con este Link del menú.» | … «Revisa que empiece con https:// y no sea demasiado largo.» |
| `undecodable` | «No se pudo leer el contenido del QR.» | «No se pudo leer este QR. Prueba con otro archivo o cámbialo por un QR generado por la app.» |
| `storage-failed` | «Error de almacenamiento: no se pudo guardar el QR.» | … «Inténtalo de nuevo; si sigue, avisa al equipo.» |
| `asset-changed` | «El QR existente cambió desde que se verificó.» | «El archivo del QR cambió después de verificarlo. Verifícalo de nuevo.» |
| Excel `TOO_MANY_ROWS` | «El archivo tiene más filas de las permitidas» | «El archivo tiene más de 5000 filas. Divídelo en varios archivos o usa «Importar solo las primeras 5000».» |
| Excel `TOO_MANY_COLUMNS`, `ZIP_TOO_MANY_ENTRIES` | «…más columnas de las permitidas», «…demasiados componentes internos» | «Ábrelo en Excel y guárdalo de nuevo como .xlsx; si sigue fallando, quita las columnas que no uses.» |
| Excel `ZIP_BOMB`, `ZIP_SIZE_MISMATCH` | «…se rechazó por seguridad» (suena a ataque) | «El archivo está dañado o es inusual. Ábrelo en Excel y guárdalo de nuevo como .xlsx.» |
| Exportación | «Máximo 5000 piezas por exportación» | … «Exporta en grupos más pequeños.» |
| Medidas | «Debe estar entre 0 y 5» | «Escribe un valor entre 0 y 5 mm» |
| Posición del texto | «No hay espacio sobre el QR para el bloque de texto» | … «Baja el QR o reduce el bloque.» |
| Avisos | «Un elemento queda dentro del margen de seguridad» | «Un elemento invade el margen de seguridad (la franja del borde donde no debe haber nada): podría cortarse al fabricar.» |
| Avisos | «La fuente no tiene el carácter «ñ»: no se imprimirá» | … «Cámbialo por otro carácter.» |

## 4 · Media · Errores de concordancia (comprobados en el código)

| Archivo | Texto actual | Texto correcto |
|---|---|---|
| `builder-actions.ts:393` | «Se perderán **1 pieza**.» | «Se perderá 1 pieza.» / «Se perderán 3 piezas.» |
| `import-actions.ts:172` | «Se reemplazarán **las 1 piezas** actuales.» | «Se reemplazará 1 pieza actual.» |
| `ImportScreen.tsx:111` | «Se importaron **1 piezas**» | «Se importó 1 pieza» |
| `ImportScreen.tsx:112` | «y no se importaron **1 duplicadas**» | «y no se importó 1 duplicada» |
| `EditorScreen.tsx:159` | «**1 pieza tiene** errores: **corrígelas**…» | «1 pieza tiene errores: corrígela…» |

Conviene una sola función `plural()` que devuelva también el verbo (`importó/importaron`) para que no vuelva a ocurrir.

## 5 · Media · Vocabulario que cambia de una pantalla a otra

| Concepto | Palabras usadas | Propuesta |
|---|---|---|
| Elemento de la lista | pieza, registro, fila, tira | **Pieza** en toda la app; **fila** solo al hablar del Excel |
| Piezas que no se pudieron leer | registro ilegible (`builder-actions`), piezas dañadas (pantalla), cuarentena | **Piezas dañadas** (ya cambiado en pantalla; falta en `builder-actions.ts:312-322`) |
| Dirección web | Link, enlace, URL | **Link** (nombre del campo) y «dirección» en frases; evitar «URL» |
| Agregar | Agregar, Añadir, Crear | **Agregar** (usado en la mayoría) |
| Generar / resolver / regenerar | «Resuelve el QR…», «Regenerar», «Crear un QR nuevo» | «Genera el QR…», «Crear un QR nuevo» |
| Mapeo | «aplicar el mapeo de columnas» | «aplicar las columnas elegidas» |
| Paginación | «Tira 1 de 3» (`EditorScreen.tsx:140`) | «Página 1 de 3» |
| Hoja de Excel | «cabecera en la fila 1» | «títulos de columna en la fila 1» (en México se dice «encabezado») |
| Regional (es-MX) | «Añadir», «informe de errores», «equipo» (PC) | «Agregar», «reporte de errores», «computadora» *(opcional)* |

## 6 · Media · Instrucciones de formularios

| Campo | Hoy | Problema | Propuesta |
|---|---|---|---|
| Link del QR | «Opcional. Vacío: se genera un QR nuevo. Con un link: se usa ese QR (un SVG) y NO se genera otro.» | Telegráfico; se corta en el diálogo | «Déjalo vacío para que la app genere el QR. Si ya tienes un QR hecho, pega aquí el link de su archivo SVG: se usará ese y no se generará otro.» |
| Link del menú | «Es lo que contiene el QR.» | Críptico | «Dirección a la que lleva el QR al escanearlo.» |
| Resort / Servicio | «El QR se genera con el link estable de este resort y servicio.» | «link estable» es jerga y no dice que rellena el campo | «Elige un resort y un servicio para rellenar el Link del menú con su dirección fija. Así podrás cambiar el destino después sin reimprimir el QR.» |
| Estación, Sub-grupo, Concepto | sin ayuda | No se sabe qué poner ni que son opcionales | Añadir «(opcional)» al nombre y un ejemplo de cada uno |
| Importar → Link del menú por defecto | Una frase de 41 palabras que repite lo del Resort | Se abandona a mitad | «Úsalo solo si tu archivo no trae la columna «Link del menú», o la trae vacía en algunas filas.» |
| Duplicados | «Mantener / Eliminar duplicados / Revisar manualmente» | «Mantener» ¿qué? | «Importar todas / Quitar las repetidas / Decidir una por una» |
| Botón de importar | «Importar 12 · descartar 3» | Dos acciones en un botón | «Importar 12 piezas (se descartan 3 duplicadas)» |

## 7 · Media · Confirmaciones: falta la consecuencia o el verbo claro

La regla `confirmation-dialogs` pide decir **qué se pierde** y usar el verbo de la acción.

| Diálogo | Hoy | Propuesta |
|---|---|---|
| Aviso de solapamiento al exportar | «El QR se solapa con el texto en 3 piezas… ¿Generar el PDF de todos modos?» con botón «Generar de todos modos» | Añadir el botón «Revisar las piezas» (hoy solo se puede cancelar) |
| ¿Reemplazar el QR existente? | «Se quitará el Link del QR y la aplicación generará un QR nuevo» | … «Si ya imprimiste el QR anterior, seguirá funcionando; el nuevo solo vale para lo que imprimas ahora.» |
| Avisos tras decidir | «Se mantendrá el QR anterior» / «Se usará el QR existente tal cual (confirmado)» | «Se imprimirá el QR anterior en esta pieza» / «Se usará este QR aunque apunte a otra dirección» (igual que los botones) |
| Cambio del Link del menú | «Cambiaste el Link del menú de M1: su QR quedó desactualizado» + botón «Regenerar» | «El Link del menú de M1 cambió y su QR sigue apuntando al link viejo.» + botón «Crear QR nuevo» |
| SVG con QR pendiente | «Resuelve el QR y los errores de M1 antes de descargar su SVG» | «Primero genera el QR y corrige los errores de M1 · Tropical; después podrás descargar su SVG.» |

## 8 · Baja · Tono

- **Voz:** conviven el tuteo («Revisa»), el impersonal («Se importaron») y la primera persona del plural («No pudimos reconocer», «No encontramos»). Propuesta: tuteo para instrucciones, impersonal para resultados y **evitar «nosotros»** salvo en errores (así suena a persona y no a sistema).
- **Alarmismo:** «Archivo sospechoso», «se rechazó por seguridad» asustan sin necesidad (ver hallazgo 3).
- **Éxitos:** son breves y buenos («Pieza agregada: M1 · Tropical»). Dejarlos así.
- **Estados vacíos:** bien resueltos («Aún no hay piezas» + dos botones, «Agrega al menos una pieza para continuar»).

## 9 · Baja · Nombres accesibles con separadores

Los nombres como «M1 · Tropical» se usan también para lectores de pantalla, que suelen leer el «·» como «punto medio». Propuesta: en los `aria-label` usar coma («M1, Tropical»). No se verificó con VoiceOver.

---

## Guía de estilo propuesta (una página para el equipo)

1. **Instrucciones:** verbo en imperativo + objeto concreto («Selecciona el archivo otra vez»). Una idea por frase; máximo ~25 palabras.
2. **Errores:** qué pasó + por qué (si se sabe) + qué hacer. Nunca códigos, nombres de cabeceras ni comandos en pantalla; van al registro con una referencia.
3. **Confirmaciones:** título = pregunta («¿Salir sin guardar el proyecto?»); mensaje = qué se pierde; botón = verbo de la acción («Salir sin guardar»); siempre un botón para el camino seguro.
4. **Vocabulario fijo:** pieza, fila (solo Excel), Link, agregar, guardar (archivo), guardado automático (navegador), descargar (PDF/SVG), piezas dañadas.
5. **Números y plurales:** una sola función que acuerde sustantivo y verbo.
6. **Sin jerga:** «instantánea», «hash», «clave», «mapeo», «resolver», «cuarentena», «tira», «link estable».

## Orden sugerido

1. **Hoy:** hallazgo 4 (5 líneas de código) y hallazgo 1 (vocabulario de «guardado»).
2. **Esta semana:** hallazgos 2 y 3 (catálogo de errores: un solo archivo por área, con prueba de que ningún mensaje contiene comandos ni nombres de cabeceras).
3. **Después:** hallazgos 5–7, y validar la guía de estilo con una persona de operaciones.

Al aplicar, actualizar los tests que citan textos (`EditorScreen.test.tsx`, `builder-actions.test.ts`, `import-actions.test.ts` y los e2e de `builder*.spec.ts`).
