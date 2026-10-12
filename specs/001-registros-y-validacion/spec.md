# Feature Specification: Registros de piezas y validación

**Feature Branch**: `001-registros-y-validacion` (retrospectiva; se desarrolló en la rama `integracion-front-back`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva del modelo de dominio de las piezas (`QRRecord`), su validación, su estado local y la pantalla `/editor`. Fuentes normativas: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §C (modelo, Zod, invariantes), §S6 (estado y persistencia), §S7 (errores y notificaciones), §1.2 (ambigüedades) y el «Registro de decisiones» (R1). Código: `src/lib/records`, `src/lib/validation`, `src/lib/state`, `src/schemas`, `src/types`, `src/components/records`, `src/components/forms`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Alta y edición manual de una pieza (Priority: P1)

Una persona de diseño agrega una pieza con el formulario «+ Agregar nuevo» escribiendo Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú y, opcionalmente, Link del QR. El formulario valida en vivo con las mismas reglas que la importación y la exportación y no deja guardar con datos inválidos.

**Why this priority**: sin registros válidos no hay piezas que diseñar ni exportar; es la unidad de datos de todo el producto (ver [`docs/ARCHITECTURE.md` §1.2-28](../../docs/ARCHITECTURE.md)).

**Independent Test**: abrir `/editor`, completar el formulario y guardar; la pieza aparece en la lista con su estado de QR. Cubierto por `src/components/records/EditorScreen.test.tsx` y `src/lib/validation/form.test.ts`.

**Acceptance Scenarios**:

1. **Given** un formulario vacío, **When** la persona intenta guardar, **Then** se muestran errores en Área, Mesa y Link del menú y no se crea ninguna pieza.
2. **Given** una Mesa con formato libre («Terraza 4», «VIP-A», «1»), **When** se guarda, **Then** se acepta sin catálogos ni formatos impuestos (decisión R1).
3. **Given** un Link del menú con `http://`, **When** se valida, **Then** se guarda con el aviso «La URL usa http; se recomienda https» y sin bloquear.
4. **Given** un Link del menú `javascript:`, con IP o `localhost`, **When** se valida, **Then** se rechaza.
5. **Given** un Link del QR presente, **When** se guarda, **Then** la pieza nace con QR existente sin verificar y nunca se genera otro; sin Link del QR nace pendiente.

---

### User Story 2 - El trabajo sobrevive a recargar sin perder datos (Priority: P1)

El proyecto (piezas, orden, plantilla, opciones) se autoguarda en el navegador (IndexedDB) y se restaura al volver. Lo que no se puede leer no se pierde: se aparta por registro o se respalda.

**Why this priority**: no hay base de datos de servidor; IndexedDB es la única persistencia ([§1.2-11](../../docs/ARCHITECTURE.md), [§S6](../../docs/ARCHITECTURE.md)).

**Independent Test**: crear piezas, recargar y comprobar que se restauran con aviso y sin regenerar QR. Cubierto por `src/lib/state/persistence.test.ts` y `EditorScreen.test.tsx`.

**Acceptance Scenarios**:

1. **Given** un proyecto guardado, **When** se recarga, **Then** se restaura con el aviso «Proyecto restaurado: N piezas · modificado …» y un QR generado sigue generado.
2. **Given** un registro guardado sin forma válida, **When** se hidrata, **Then** va a cuarentena con su motivo y el resto carga intacto, con el aviso «N registros no se pudieron leer» y las acciones Ver, Descargar y Descartar.
3. **Given** un registro con forma válida que incumple una regla de negocio, **When** se hidrata, **Then** queda visible y editable con `validationErrors`.
4. **Given** una envoltura ilegible o de una versión más reciente, **When** se carga, **Then** se guarda una copia `backup-<fecha>`, se empieza un proyecto vacío y se ofrece «Descargar copia».
5. **Given** IndexedDB no disponible, **When** se abre la app, **Then** se trabaja en memoria con un aviso permanente y la opción «Guardar proyecto».

---

### User Story 3 - Navegar, buscar y filtrar piezas en `/editor` (Priority: P2)

La persona recorre las piezas una a una («Pieza N de M»), en una tira o rejilla paginada, busca por texto y filtra con los contadores (Total, Con QR, Necesitan QR, Con errores, Excluidas).

**Why this priority**: con cientos de piezas hace falta localizar y revisar rápido ([§1.1](../../docs/ARCHITECTURE.md), prioridad 5 y 6).

**Independent Test**: cargar 1000 piezas, cambiar de página, buscar por mesa y activar un contador. Cubierto por `EditorScreen.test.tsx` y `src/lib/state/counters.test.ts`.

**Acceptance Scenarios**:

1. **Given** 1000 piezas, **When** se usa la rejilla, **Then** se muestran 24 por página («Página N de M») sin renderizarlas todas.
2. **Given** una búsqueda «m1», **When** se escribe, **Then** se listan las piezas cuyos campos coinciden sin distinguir mayúsculas ni acentos.
3. **Given** el contador «Necesitan QR», **When** se pulsa, **Then** la lista se filtra y pulsarlo de nuevo quita el filtro.
4. **Given** un filtro sin resultados, **When** se muestra la lista, **Then** aparece «Ninguna pieza coincide con el filtro o la búsqueda» con «Quitar filtros».

---

### User Story 4 - Duplicar, eliminar con deshacer y reordenar (Priority: P2)

La persona duplica una pieza, la elimina (siempre con confirmación y [Deshacer]) y cambia su posición arrastrando, con teclado, con «Mover a…» o con «Ordenar por…».

**Why this priority**: el orden de la lista es el orden del PDF y borrar por error es el daño más costoso ([§S6](../../docs/ARCHITECTURE.md), «Borrado»).

**Independent Test**: eliminar una pieza, deshacer y comprobar que vuelve a su posición. Cubierto por `src/components/records/builder-actions.test.ts`, `EditorScreen.test.tsx` y `src/lib/records/order.test.ts`.

**Acceptance Scenarios**:

1. **Given** una pieza, **When** se pulsa Eliminar, **Then** se pregunta «¿Eliminar la pieza …?» con la casilla «No volver a preguntar en esta sesión»; cancelar no borra nada.
2. **Given** una eliminación confirmada, **When** se pulsa [Deshacer] en el aviso «Pieza eliminada», **Then** la pieza vuelve a su posición original, también en lotes.
3. **Given** un borrado masivo, **When** se confirma, **Then** el diálogo dice «¿Eliminar N piezas?» + «Puedes deshacerlo.» y la casilla de sesión no se ofrece.
4. **Given** una pieza, **When** se duplica, **Then** la copia queda justo después, con los mismos datos y el mismo QR, marcada como duplicado y sin aviso de duplicado.
5. **Given** una pieza en la posición 240 de 1000, **When** se usa «Mover a…» posición 1, **Then** `order` sigue siendo una permutación de los ids.
6. **Given** «Ordenar por Mesa», **When** se confirma, **Then** el orden es natural en español (M2 antes que M10) y estable.

---

### User Story 5 - Detección de duplicados con clave configurable (Priority: P2)

Dos piezas se consideran duplicadas si coincide su clave (por defecto los seis campos de datos, sin distinguir mayúsculas y con URL canónica sin `#fragmento`). Nunca se borra nada en silencio.

**Why this priority**: evita imprimir la misma placa dos veces ([§1.2-10](../../docs/ARCHITECTURE.md)). La aplicación de las estrategias a una importación se especifica en [`specs/003-importacion-excel-csv`](../003-importacion-excel-csv/spec.md).

**Independent Test**: dar de alta una pieza igual a otra; se avisa sin bloquear. Cubierto por `src/lib/records/duplicates.test.ts` y `builder-actions.test.ts`.

**Acceptance Scenarios**:

1. **Given** una pieza igual a una existente, **When** se agrega a mano, **Then** se avisa «Pieza agregada. Ya había una igual: …» y se crea igualmente.
2. **Given** una lista de filas duplicadas, **When** se aplica Mantener, Eliminar duplicados o Revisar, **Then** `toCreate + discarded` contiene todas las filas.
3. **Given** la clave editada (campos, mayúsculas, URL canónica), **When** se recalcula, **Then** los grupos cambian conforme a la nueva clave.

---

### User Story 6 - Guardar y abrir el proyecto en un archivo, con una sola pestaña escritora (Priority: P3)

«Guardar proyecto» descarga `{nombre}.qrproj.json`; «Abrir proyecto…» lo restaura. Solo una pestaña escribe; las demás quedan en solo lectura con «Tomar el control».

**Why this priority**: respaldo explícito frente a los límites de IndexedDB y protección frente a escrituras cruzadas ([§S6](../../docs/ARCHITECTURE.md)).

**Independent Test**: guardar, abrir en otra sesión y comprobar que no se regenera ningún QR. Cubierto por `src/lib/state/project-file.test.ts`, `src/lib/state/tab-lock.test.ts` y `builder-actions.test.ts`.

**Acceptance Scenarios**:

1. **Given** un archivo de proyecto, **When** se abre, **Then** se borran todos los `qrAck` y se informa «N piezas necesitan confirmar de nuevo su QR».
2. **Given** un archivo de más de 20 MB o de una versión más reciente, **When** se abre, **Then** se rechaza con un mensaje claro y el proyecto actual no cambia.
3. **Given** cambios sin guardar, **When** se abre otro proyecto o se empieza uno nuevo, **Then** se pregunta «Tienes cambios sin guardar.» antes de continuar.
4. **Given** otra pestaña escritora, **When** se abre la app, **Then** queda en solo lectura con «Tomar el control», que recarga lo guardado antes de permitir editar.

---

### Edge Cases

- Campo con caracteres de control o invisibles (bidi, zero-width, BOM): se normalizan (NFC, controles a espacio, formato eliminado salvo ZWJ, espacios colapsados).
- Texto que supera el máximo (Área, Estación, Sub-grupo, Concepto: 120; Mesa: 40): error «… supera N caracteres».
- Carácter sin glifo en la fuente de la pieza: aviso en el formulario, no error; no se comprueba en Excel ni en `validateRecord` (ver Pendientes).
- Estado `generating`: nunca se persiste; al hidratar vuelve a `pending` (invariante 9).
- Id repetido o distinto de su clave al hidratar: el registro va a cuarentena.
- Orden persistido incoherente: `repairOrder` quita ids desconocidos o repetidos y añade al final los que faltan.
- Pieza editada o eliminada mientras se resolvía su QR: la guarda de aplicación descarta el resultado tardío.
- Reordenar con filtro o búsqueda activos, en móvil o en solo lectura: el arrastre se desactiva; «Mover a…» sigue disponible.
- Al importar, un Link del QR no seguro (puerto distinto de 443, host no permitido) deja la pieza con `qrError` y bloqueada para exportar, nunca con QR generado de respaldo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE modelar cada pieza como `QRRecord` con `area`, `estacion`, `mesa`, `subgrupo`, `concepto`, `menuUrl`, `qrUrl` opcional, `qrStatus`, `qr`, `qrError`, `qrAck`, `order`, `validationErrors`, `metadata`, `createdAt` y `updatedAt` (`src/schemas/record.ts`, `StoredRecordSchema`).
- **FR-002**: Área, Estación, Mesa, Sub-grupo y Concepto DEBEN ser texto libre: solo se normalizan, se limita su longitud (120/120/40/120/120) y no hay listas cerradas (R1).
- **FR-003**: Área, Mesa y Link del menú DEBEN ser obligatorios; Estación, Sub-grupo y Concepto, opcionales (`REQUIRED_FIELDS`).
- **FR-004**: La validación DEBE ser estricta (reglas de negocio) en formulario, filas de Excel, re-validación tras cada mutación y exportación, y tolerante (solo forma y longitudes máximas) al hidratar IndexedDB o abrir un `.qrproj.json`.
- **FR-005**: El Link del menú DEBE ser una URL http(s) con dominio, sin espacios ni invisibles, sin credenciales, de hasta 2048 caracteres, y se guarda en forma canónica WHATWG.
- **FR-006**: El Link del QR aportado DEBE ser https y de la misma familia de URL segura; un link presente nunca provoca generación de QR.
- **FR-007**: Los mensajes al usuario DEBEN estar en español y ser exactos: «Falta Link del menú», «Mesa vacía», «Área vacía», «Link del menú inválido», «Link del QR inválido» (`src/lib/validation/messages.es.ts`).
- **FR-008**: Tras cada mutación el sistema DEBE recalcular `qrStatus` y `validationErrors` (`withDerived`); un registro con errores sigue visible y editable pero no es exportable.
- **FR-009**: El sistema DEBE detectar duplicados con una clave configurable (campos, mayúsculas, URL canónica) y devolver siempre qué se crea y qué se descarta; el alta manual solo avisa y la acción Duplicar está exenta.
- **FR-010**: El proyecto DEBE autoguardarse en IndexedDB con debounce de 200 ms, con vaciado en `visibilitychange` y `pagehide`, y mostrar «Guardando…» / «Guardado en este navegador».
- **FR-011**: La hidratación DEBE validar por registro: lo ilegible va a `quarantine` con motivo; nunca se descarta un proyecto entero salvo envoltura ilegible, que se respalda en `backup-<fecha>`.
- **FR-012**: `ProjectState.order` DEBE ser siempre una permutación de las claves de `recordsById` (invariante 7).
- **FR-013**: La pantalla `/editor` DEBE ofrecer vista de páginas y de rejilla (24 piezas por página por defecto), búsqueda sobre los campos de datos y el Link del menú, y contadores que actúan como filtros.
- **FR-014**: Eliminar DEBE pedir confirmación siempre (individual o masivo) y dejar [Deshacer] que restaura cada pieza en su posición original.
- **FR-015**: El sistema DEBE permitir duplicar, mover a una posición, ordenar por Área, Estación, Mesa o fila de Excel (con confirmación y orden natural en español) y reordenar arrastrando con puntero, táctil o teclado.
- **FR-016**: «Guardar proyecto» DEBE descargar `{nombre}.qrproj.json`; «Abrir proyecto» DEBE rechazar más de 20 MB, JSON inválido o versión mayor, validar por registro, borrar todos los `qrAck` y no regenerar ningún QR.
- **FR-017**: Solo una pestaña DEBE escribir (Web Locks, bloqueo `qr-project`); las demás quedan en solo lectura con «Tomar el control», y un cambio de rol de lectora a escritora DEBE recargar lo guardado.
- **FR-018**: Si el proyecto tiene cambios sin guardar (`revision !== savedRevision`) o QR en curso, el cierre de pestaña DEBE mostrar el diálogo nativo `beforeunload`; abrir otro proyecto o empezar uno nuevo DEBE preguntar «Tienes cambios sin guardar.».
- **FR-019**: Los avisos DEBEN mostrarse con `NotificationsProvider` (sin `alert()`), agrupados por `group`, y los errores persisten hasta cerrarse ([§S7](../../docs/ARCHITECTURE.md)).

### Key Entities

- **QRRecord**: pieza física con sus datos, el origen de su QR (`none`, `generated`, `existing`) y su estado derivado. Ver [`docs/ARCHITECTURE.md` §C](../../docs/ARCHITECTURE.md) y [`data-model.md`](./data-model.md).
- **RecordDraft**: datos editables tras validación estricta (formulario o fila de Excel).
- **ValidationIssue**: problema de un campo con `code`, `message` y severidad (`error`, `warning`, `info`).
- **QuarantineEntry**: registro ilegible conservado con su motivo y fecha.
- **ProjectState**: registros por id, `order`, cuarentena, plantilla, opciones de exportación, clave de duplicados, `revision` y `savedRevision`.
- **DuplicateKeyConfig / DuplicateGroup**: clave configurable y grupos de duplicados por archivo o por proyecto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Las reglas de campos obligatorios, texto libre, URLs seguras y mensajes exactos están cubiertas por 18 declaraciones de test en `src/lib/validation/validate.test.ts` (varias con `it.each`) y 9 en `src/lib/validation/form.test.ts`.
- **SC-002**: Mover la pieza 240 a la posición 1 con 1000 piezas conserva la permutación (`src/lib/records/order.test.ts`).
- **SC-003**: Eliminar y deshacer restaura cada pieza en su posición, también en lotes (`src/lib/state/project.test.ts`, `builder-actions.test.ts`).
- **SC-004**: Recargar restaura el proyecto sin regenerar ningún QR y un registro corrupto no afecta al resto (`src/lib/state/persistence.test.ts`, `src/lib/records/hydrate.test.ts`).
- **SC-005**: La rejilla con 1000 piezas pagina sin renderizarlas todas (`EditorScreen.test.tsx`); la medición en Chromium de 10–16 ms por cambio de página está en [`docs/ARCHITECTURE.md` Fase 6](../../docs/ARCHITECTURE.md) y se verifica con `tests/e2e/builder-acceptance.spec.ts`.
- **SC-006**: El ejemplo `248 = 240 válidas + 5 con errores + 3 duplicadas` se cumple en `src/lib/records/duplicates.test.ts`.
- **SC-007**: Abrir un `.qrproj.json` borra los acks y no regenera QR (`src/lib/state/project-file.test.ts`); una segunda pestaña queda en solo lectura (`src/lib/state/tab-lock.test.ts`).
- **SC-008**: La suite completa pasa con 917 tests (`bun run test`), con cobertura mínima de líneas del 85 % configurada en `vitest.config.mts`.

## Assumptions

- Los campos de texto no tienen catálogos; si «abiertos» significara «todos opcionales», solo cambiaría la tabla de [§1.2-28](../../docs/ARCHITECTURE.md) (nota de R1).
- El proyecto vive en el navegador de una sola persona; no hay base de datos ni sincronización entre dispositivos.
- La regla crítica del QR (constitución, principio II) la implementa `src/lib/records/qr-state.ts`; esta spec solo describe cómo el registro la respeta.
- La importación de Excel y CSV, y la aplicación de las estrategias de duplicados a un archivo, se especifican en `specs/003-importacion-excel-csv`.
- El deshacer/rehacer del editor visual (`EditorHistory`, ruta `/preview`) restaura diseño, no datos de piezas; no forma parte de esta spec.

## Pendientes

- No verificado: que el aviso de glifos ausentes (`findUnsupportedChars`) deba extenderse a Excel y a `validateRecord`; hoy solo actúa en el formulario.
- No verificado: migración de proyectos de `schemaVersion` anterior; el esquema fija `schemaVersion` en `2` y una versión distinta se respalda y se empieza vacío.
