# Feature Specification: Acortador de links del menú

**Feature Branch**: `mejoras-ux` (continúa sobre la rama de trabajo actual)

**Created**: 2026-10-14

**Status**: In progress (Fase A en implementación; Fase B —Supabase— diseñada, pendiente de la integración)

**Input**: Petición del usuario: «necesitamos que haya una forma de acortar los links para que el QR no contenga mucha información». Decisiones tomadas en la conversación (2026-10-14): (1) se acortan **todos** los links de la columna «Link del menú»; (2) **siempre**, para mantener un estándar; (3) el Excel actualizado **reemplaza** «Link del menú»; (4) por ahora la herramienta está abierta a todos, y al integrarse en otra plataforma habrá roles y usuarios; (5) las imágenes de los QR y los links irán a **Supabase** (el de la otra plataforma) al integrarse, y las imágenes serán accesibles solo para quienes tengan permisos.

## Problema

El QR codifica el «Link del menú». Con corrección de errores H, un link largo produce un QR denso y de módulos diminutos (medido con la plantilla actual, QR de 24.788 mm):

| Contenido del QR | Caracteres | Módulos | Módulo | Estado |
|---|---|---|---|---|
| `https://qr.pr.mx/Ab3dE9x1` (dominio corto) | 24 | 29 × 29 | 0.855 mm | cómodo |
| link estable `…/api/qr/TGPC/pool` | 55 | 41 × 41 | 0.605 mm | límite sin aviso |
| link de menú de 80 caracteres | 80 | 49 × 49 | 0.506 mm | aviso (< 0.6 mm) |
| link de menú de 150 caracteres | 150 | 65 × 65 | 0.381 mm | **bloquea** (< 0.45 mm) |
| link de menú de 250 caracteres | 250 | 81 × 81 | 0.306 mm | **bloquea** |

Un Excel con links largos hoy no se puede fabricar. Además, el link grabado en el metal no puede cambiar nunca.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar un Excel con links largos y que se acorten solos (Priority: P1)

La persona sube su Excel (o CSV) con un «Link del menú» muy largo en cada fila. Al confirmar la importación, cada link se acorta automáticamente: las piezas quedan con el link corto, el QR lo codifica y es legible.

**Why this priority**: es el caso de uso que motiva la funcionalidad; sin él, los lotes con links largos no se pueden fabricar.

**Independent Test**: importar un CSV con tres filas con links de 150, 250 y 400 caracteres; las piezas creadas tienen `menuUrl` = `{dominio}/s/{código de 8}` y el QR es de ≤ 41 módulos.

**Acceptance Scenarios**:

1. **Given** una fila con un link largo válido, **When** se confirma la importación, **Then** la pieza guarda el link corto y su QR codifica el link corto.
2. **Given** varias filas con el mismo link largo, **When** se confirma, **Then** todas reciben el **mismo** link corto (un solo registro).
3. **Given** una fila con un link inválido, **When** se confirma, **Then** no se acorta, queda con su error de validación y no bloquea al resto.
4. **Given** que el servicio de acortado no responde, **When** se confirma, **Then** no se crea ninguna pieza con link largo, se muestra un error con «Reintentar» y la revisión sigue abierta.

---

### User Story 2 - Que el link corto no cambie nunca para el mismo link (Priority: P1)

Si la misma persona o cualquier otra vuelve a subir el mismo Excel, o crea otra pieza con el mismo link largo, obtiene **el mismo link corto**. Un QR ya grabado no se invalida por reimportar.

**Why this priority**: es la garantía central: el QR es de metal y no se puede reimprimir barato.

**Independent Test**: acortar el mismo link dos veces (incluso con el proyecto vacío) devuelve el mismo código y no crea un registro nuevo.

**Acceptance Scenarios**:

1. **Given** un link largo ya acortado, **When** se acorta de nuevo, **Then** el estado es «reutilizado» y el código es idéntico.
2. **Given** que el destino de un código se editó después, **When** se vuelve a acortar el link largo original, **Then** el código es el mismo y el destino editado **no** se pisa.
3. **Given** dos links largos distintos cuyo código colisiona, **When** se acortan, **Then** el segundo recibe otro código, de forma determinista, y ninguno pisa al otro.

---

### User Story 3 - Descargar el Excel actualizado con el link corto (Priority: P1)

Tras importar, la persona descarga su Excel actualizado: la columna «Link del menú» trae ahora el link corto. Con ese archivo puede seguir trabajando; al volver a subirlo, las filas ya cortas se reconocen y se conservan.

**Why this priority**: es lo que permite «continuar» sin perder la identidad de los links.

**Independent Test**: tras importar, «Descargar Excel actualizado» produce un `.xlsx` cuyas filas coinciden con las piezas y cuyo «Link del menú» es el corto; reimportarlo no cambia ningún link.

**Acceptance Scenarios**:

1. **Given** piezas con link corto, **When** se descarga el Excel actualizado, **Then** el archivo trae las columnas Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú (corto) y Link del QR, con los mismos encabezados que reconoce la importación.
2. **Given** ese archivo, **When** se importa, **Then** las filas con link corto se conservan tal cual (estado «conservado») y no se crea un código nuevo.
3. **Given** la descarga, **When** se abre el archivo, **Then** incluye una columna «Link original (referencia)» con el destino vigente de cada código; la aplicación no la lee.
4. **Given** una pieza con QR generado por la herramienta, **When** se descarga el Excel, **Then** «Link del QR» queda vacío (un QR propio no se convierte en «existente»); solo se rellena para QR que la persona aportó.

---

### User Story 4 - Acortado también al crear o editar una pieza a mano (Priority: P2)

Al guardar el formulario, el link del menú se acorta automáticamente. La pieza muestra el link corto (lo que lleva el QR) y su destino real.

**Independent Test**: guardar una pieza con un link largo; el registro queda con el link corto.

**Acceptance Scenarios**:

1. **Given** el formulario con un link largo, **When** se guarda, **Then** la pieza queda con el link corto.
2. **Given** el link estable de un resort (`/api/qr/{resort}/{servicio}`) o un link corto propio, **When** se guarda, **Then** no se vuelve a acortar.

---

### User Story 5 - Cambiar el destino sin reimprimir (Priority: P2)

Si el menú de un restaurante cambia de dirección, una persona edita el **destino** de la pieza desde la aplicación; el QR impreso sigue funcionando y lleva al destino nuevo. Hoy cualquiera con acceso a la herramienta puede hacerlo (más adelante, según rol).

**Independent Test**: cambiar el destino de un código y comprobar que `/s/{código}` redirige al nuevo; el historial guarda el anterior.

**Acceptance Scenarios**:

1. **Given** una pieza con link corto, **When** se abre el detalle, **Then** se ve el destino actual y el botón «Cambiar destino».
2. **Given** un destino nuevo válido, **When** se confirma (con aviso de que las placas impresas lo seguirán), **Then** `/s/{código}` redirige al destino nuevo y el historial conserva el anterior con su fecha.
3. **Given** un destino inválido o que apunta a nuestro propio link corto, **When** se intenta guardar, **Then** se rechaza con un mensaje claro.

---

### User Story 6 - Supabase al integrar en la plataforma con roles (Priority: P3, Fase B)

Al integrarse en la otra plataforma, los links cortos y el registro de QR se guardan en la base de datos de Supabase, y las imágenes de los QR en Supabase Storage, accesibles solo para quien tenga permisos. El link corto (lo que escanean los huéspedes) sigue siendo público.

**Why this priority**: depende de la integración, que aún no existe; se diseña ahora para no cerrar puertas.

**Independent Test (cuando exista)**: crear un link corto con el repositorio de Supabase y leerlo desde otra instancia; un usuario sin permiso no puede abrir la imagen de un QR.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Todo «Link del menú» válido se acorta a `{dominio}/s/{código}` antes de guardar la pieza (importación y formulario). El dominio es `NEXT_PUBLIC_QR_DOMAIN` o, si está vacío, el origen de la aplicación.
- **FR-002**: El código tiene 8 caracteres del alfabeto `23456789abcdefghjkmnpqrstuvwxyz` (minúsculas, sin caracteres ambiguos ni mayúsculas, para no colisionar en sistemas de archivos que no distinguen mayúsculas).
- **FR-003**: El código es **determinista** respecto al link normalizado: sale de `sha256(link normalizado)`. Acortar dos veces el mismo link da el mismo código sin necesidad de un índice.
- **FR-004**: Un código ocupado por otro link se resuelve con un contador de intento determinista (`sha256(link + "\0" + intento)`), hasta 10 intentos; nunca se sobrescribe un registro existente al crear.
- **FR-005**: Cada código guarda: destino vigente, link original, fechas, revisión e historial de destinos anteriores (máximo 20).
- **FR-006**: `GET /s/{código}` es público: responde 302 al destino vigente con `Cache-Control: no-store`; un código desconocido o mal formado responde 404. Su caché interna es de unos 30 s.
- **FR-007**: Los links propios no se vuelven a acortar: los de forma `/s/{código}` (se verifica que existan) y los links estables `/api/qr/{resort}/{servicio}`.
- **FR-008**: El destino solo puede ser `http(s)` válido según `SafeHttpUrlSchema`, de ≤ 2048 caracteres, sin credenciales y **no** puede apuntar a un link corto propio (evita bucles).
- **FR-009**: Crear y editar requieren autenticación y mismo origen (`withApiGuards`) y tienen límite de peticiones propio.
- **FR-010**: Cambiar un destino no cambia el código ni el QR: no vuelve «desactualizado» ningún QR.
- **FR-011**: Importar con links largos: si el acortado falla por completo, no se crea ninguna pieza (nada silencioso) y se ofrece reintentar.
- **FR-012**: «Descargar Excel actualizado» genera un `.xlsx` con los encabezados que la importación reconoce, el link corto en «Link del menú» y una columna de referencia con el destino. «Link del QR» solo se rellena para QR aportados por la persona.
- **FR-013**: La regla crítica del QR no cambia: una pieza con «Link del QR» nunca genera un QR nuevo, y el acortado no toca ese campo.
- **FR-014**: Las claves de los registros de links (`s/v1/{código}.json`) nunca se sirven públicamente: la ruta de storage solo entrega claves de QR.
- **FR-015** *(Fase B)*: El repositorio de links es una interfaz (`ShortLinkRepository`); la implementación por archivos de objeto (S3/R2/local/Supabase Storage) funciona hoy y una implementación sobre Postgres de Supabase la sustituye sin cambiar el resto del código.
- **FR-016** *(Fase B)*: Las imágenes de los QR se sirven solo a usuarios con permiso; el redirect `/s/{código}` sigue siendo público.

### Key Entities

- **ShortLink**: `{ v, code, destination, originalUrl, createdAt, updatedAt, revision, history[] }`. Clave `[prefijo/]s/v1/{código}.json`.
- **Resultado de acortar** (por link): `created` | `reused` | `kept` (ya era propio) | `invalid`.

## Success Criteria *(mandatory)*

- **SC-001**: Con un Excel de links de 150 a 400 caracteres, el QR de todas las piezas es de ≤ 41 × 41 módulos con el dominio de la aplicación (módulo ≥ 0.605 mm) y no hay avisos de módulos pequeños.
- **SC-002**: Reimportar el mismo Excel (largo o actualizado) no crea registros de links nuevos.
- **SC-003**: Cambiar un destino no modifica ningún archivo de QR ni el estado de ninguna pieza.
- **SC-004**: Un lote de 5000 filas se acorta en menos de 30 s en el servidor de producción (a medir; el límite es por lotes de 200).

## Edge Cases

- Mismo link largo escrito distinto (mayúsculas en el host, barra final): se normaliza con `new URL().href`; diferencias reales del camino o de los parámetros generan códigos distintos.
- Link largo con parámetros de seguimiento: se conservan; el destino es exactamente lo que escribió la persona.
- Importar el Excel **original** (largo) después de haber importado ya la versión corta: la detección de duplicados compara `menuUrl` y no los reconoce como iguales. Mitigación: continuar con el Excel actualizado. Mejora pendiente (T-090).
- Si el almacenamiento falla a mitad de un lote: los links ya creados no se pierden (son idempotentes); el reintento reutiliza.
- `NEXT_PUBLIC_QR_DOMAIN` cambia entre importaciones: los links cortos ya impresos apuntan al dominio anterior. Es la misma restricción del link estable: el dominio debe ser permanente.

## Decisiones

| # | Decisión | Motivo |
|---|---|---|
| D1 | Acortador propio, no un servicio externo | Permanencia y control: el QR va grabado en metal |
| D2 | Código determinista por link, sin índice | Idempotencia sin consultas extra; mismo link → mismo código aunque se pierda el estado del navegador |
| D3 | Los links `/s/…` y `/api/qr/…` propios no se acortan | Ya son cortos y estables; un salto extra no aporta |
| D4 | El Excel actualizado reemplaza «Link del menú» y añade «Link original (referencia)» | Decisión del usuario; la referencia evita perder el destino |
| D5 | El destino se edita en la aplicación, no en el Excel | El Excel ya no lleva el destino real |
| D6 | Hoy cualquiera con acceso puede cambiar un destino; con historial | La herramienta está abierta; los roles llegan con la plataforma |
| D7 | `/s/{código}` es público y se añade a las excepciones de la constitución | Lo abren los huéspedes al escanear |
| D8 | «Link del QR» generado no se escribe al Excel | Un QR generado no debe convertirse en «existente» ni verificarse por red |

## Pendientes

- **Dominio corto**: sin él, el link corto mide ≈ 48 caracteres (41 módulos, 0.605 mm). Con un dominio corto baja a ≈ 24 caracteres (29 módulos, 0.855 mm). Decisión del usuario.
- **Fase B (Supabase)**: necesita las credenciales y el modelo de roles de la otra plataforma. Ver `plan.md`.
- **Duplicados contra links largos** (T-090).
- **Piezas existentes con link largo**: no se migran solas; una acción «Acortar links del proyecto» queda como mejora (T-091), porque cambiaría el QR de piezas que podrían estar ya impresas.
