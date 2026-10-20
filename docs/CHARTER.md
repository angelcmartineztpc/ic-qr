# Charter del proyecto — QR Production Generator

| | |
|---|---|
| **Documento** | Charter y documentación general del proyecto |
| **Versión** | 1.0 (borrador para aprobación) |
| **Fecha** | 2026-10-13 |
| **Repositorio** | `angelcmartineztpc/ic-qr` (rama de trabajo `mejoras-ux`; integración en `main`) |
| **Responsable del proyecto** | _por completar_ |
| **Estado del producto** | Funcional de punta a punta; faltan verificaciones manuales y la Fase 11–12 (ver §14 y §15) |

> Este documento resume el **qué**, el **por qué** y el **cómo** del proyecto. El detalle normativo vive en [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (su «Registro de decisiones» prevalece), en las especificaciones de [`specs/`](../specs/README.md) y en la [constitución](../.specify/memory/constitution.md). Si algo aquí contradice a esos documentos, mandan ellos.

---

## 1. Resumen ejecutivo

**QR Production Generator** es una herramienta web interna que convierte datos de restaurantes y mesas —capturados a mano o importados desde Excel/CSV— en **piezas físicas de metal de 70 × 70 mm** con un **QR vectorial**, y las exporta como **PDF vectorial listo para Adobe Illustrator** (y como SVG por pieza en un ZIP).

Su razón de ser es evitar el trabajo manual y los errores al preparar placas que se **graban en metal y no se pueden reimprimir barato**. Por eso el producto se diseñó alrededor de tres garantías:

1. **El QR correcto, una sola vez.** Un registro que ya trae su «Link del QR» **nunca** genera un QR nuevo; uno que no lo trae genera uno, se guarda y se reutiliza.
2. **La pieza idéntica al formato de referencia.** Tipografía, medidas, marco y tinta son fijos y verificables contra el PDF de referencia.
3. **Salida vectorial fiel a fabricación.** El PDF no lleva imágenes, el QR es un único trazo compuesto y las medidas son exactas en milímetros.

El flujo de trabajo es un **stepper de cuatro pasos**: **Piezas → Estilo del QR → Diseño → Exportar**.

---

## 2. Antecedentes y problema

Las placas de metal con QR se instalan en mesas y áreas de los resorts. Hasta ahora, preparar cada pieza implicaba componer a mano los textos, colocar el QR y enviar archivos a producción, con riesgo de:

- QR duplicados, regenerados sin necesidad o que apuntan a un destino equivocado.
- Piezas que no respetan el formato (fuente, tamaño, márgenes, tinta).
- Archivos que Illustrator abre con errores (texto sin la fuente, imágenes rasterizadas, medidas aproximadas).
- Falta de control sobre lotes grandes (cientos o miles de piezas).

El producto se plantea como la **única fuente de verdad** para fabricar estas piezas: valida los datos, controla el QR, compone la pieza y entrega un archivo que producción puede grabar sin retocar.

---

## 3. Objetivos

### 3.1 Objetivo general

Permitir que el equipo de producción genere, revise y exporte lotes de piezas de metal con QR vectorial, **sin errores de formato ni de contenido y sin retrabajo en Illustrator**.

### 3.2 Objetivos específicos

| # | Objetivo | Cómo se comprueba |
|---|---|---|
| O1 | Crear piezas a mano o importarlas desde Excel (`.xlsx`) y CSV, rechazando archivos incompatibles. | Importación de 5000 filas; los formatos no admitidos se rechazan con un mensaje que explica por qué. |
| O2 | Cumplir **siempre** la regla crítica del QR. | Cuatro capas de defensa (§7.1) y pruebas que fallan si se rompe cualquiera. |
| O3 | Producir la pieza **idéntica** al formato de referencia (70 × 70 mm, Address Sans Pro Cd Semibold, marco 0.5 pt, tinta negra). | Prueba contra las medidas del PDF de referencia (`piece-font.integration.test.ts`). |
| O4 | Ofrecer personalización del QR (forma, esquinas, colores, logo SVG) **sin perder legibilidad**. | Prueba que rasteriza y decodifica cada combinación; avisos y bloqueos de legibilidad. |
| O5 | Exportar PDF vectorial y ZIP de SVG con progreso y cancelación, también en lotes grandes. | 1000 piezas con generación de QR + PDF + descarga en ≈ 10.5 s (medido, servidor de producción); 0 imágenes en el PDF. |
| O6 | Dar un editor visual para ajustar la composición con precisión (mm), con deshacer y rehacer. | Pruebas del editor y del estado; medidas exactas en el SVG y el PDF. |
| O7 | Operar con seguridad y de forma desplegable (Docker de referencia y Cloudflare Workers). | Guardas HTTP en toda ruta, validación de entorno al arrancar, imagen en solo lectura. |
| O8 | Mantener el proyecto documentado y verificable. | Specs por funcionalidad, constitución, registro de decisiones y bitácora. |

### 3.3 Criterios de éxito

- Un lote de piezas importado, estilizado y exportado produce un PDF que **abre en Illustrator sin avisos** (verificación manual pendiente, §14).
- Ninguna pieza con «Link del QR» se regenera y ninguna regeneración crea archivos duplicados en el almacenamiento.
- Los lotes de hasta 5000 piezas se procesan sin bloquear al usuario y se pueden cancelar.
- Las puertas de calidad (`lint`, `typecheck`, `test`, `build`) pasan antes de integrar cualquier cambio.

---

## 4. Alcance

### 4.1 Dentro del alcance

- Alta manual y edición de piezas (Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú, Link del QR).
- Selector de **Resort + Servicio** que rellena el «Link del menú» con una URL estable.
- Importación de Excel (`.xlsx`) y CSV (UTF-8 y Windows-1252, con detección de delimitador), con mapeo de columnas y resumen de problemas.
- Resolución de QR (generar o verificar el existente), almacenamiento direccionado por contenido y link estable `/api/qr/{resort}/{servicio}`.
- **Acortador de links del menú:** todo «Link del menú» se acorta siempre a `{dominio}/s/{código}` (8 caracteres) para que el QR sea legible; el mismo link da siempre el mismo código, el destino se cambia sin reimprimir y se puede **descargar el Excel actualizado** con el link corto.
- **Estilo del QR** aplicado a todo el proyecto: contorno, forma de módulos, esquinas, colores y logo SVG.
- Editor visual de la composición (posición y tamaño del QR y del bloque de texto, plantilla, deshacer/rehacer).
- Exportación en el servidor: PDF vectorial (hoja con piezas) y ZIP de SVG; visor de hojas tipo lector de PDF; progreso y cancelación.
- Persistencia local en el navegador y archivo de proyecto `.qrproj.json`.
- Interfaz en español, responsive (escritorio y móvil) y accesible (WCAG 2.2 AA como objetivo).

### 4.2 Fuera del alcance (por ahora)

| Elemento | Nota |
|---|---|
| Hoja de calibración en el flujo | Existe el generador (`bun run render:sample`), pero se omitió de la interfaz por decisión del cliente. |
| Degradados en el QR y estilos por pieza | El estilo es del proyecto, no hay opción por pieza. |
| Logos con `<circle>`, `<ellipse>`, texto o trazos | Deben convertirse a contornos; el mensaje de error lo explica. |
| Base de datos y cuentas de usuario | MVP sin base de datos; puertos preparados para PostgreSQL. |
| Verificar un QR existente en Cloudflare Workers | Requiere `sharp`, que no existe allí; falla con un error visible. |
| CMYK, línea de corte y tinta plana en la interfaz | Existen por API; no están expuestos en la interfaz. |
| Modo oscuro | Previsto para la Fase 12. |

### 4.3 Excepción deliberada del estilo

El estilo del QR se aplica a **todas las piezas cuyo QR genera la herramienta**. Las piezas con **Link del QR** conservan ese recurso tal cual y **no se estilizan**: hacerlo equivaldría a generar un QR nuevo, lo que la regla crítica prohíbe. La pantalla avisa cuántas piezas quedan en ese caso.

---

## 5. Partes interesadas y usuarios

| Parte interesada | Interés | Interacción |
|---|---|---|
| **Equipo de producción** (usuario principal) | Preparar lotes de placas rápido y sin errores, sobre todo en escritorio. | Usa los cuatro pasos y descarga el PDF. |
| **Taller / fabricación** | Recibir archivos que graban sin retoques. | Consume el PDF/SVG; valida legibilidad y densidad del QR. |
| **Diseño** | Fidelidad de la pieza y del estilo del QR. | Define el formato de referencia; revisa el estilo. |
| **Operaciones de los resorts** | Que cada QR lleve al menú o servicio vigente. | Mantiene los destinos (`properties.ts`). |
| **TI / seguridad** | Despliegue seguro, dominio permanente del QR, licencias de fuentes. | Provee dominio, almacenamiento y credenciales. |
| **Legal / compras** | Licencias de Gotham y Address Sans Pro Cd. | Confirma uso en servidor y uso web. |
| **Huéspedes** (indirecto) | Escanear el QR y llegar al menú correcto. | Abren `/api/qr/{resort}/{servicio}` (ruta pública). |

**Recursos cubiertos hoy** (resorts del link estable): Playacar (PRPL), LeBlanc Cancún (LBCU), LeBlanc Los Cabos (LBLC), Moon Palace Sunrise (MPCU), Moon Palace Nizuc (MPNI), Beach Palace (PRBP), Cozumel (PRCZ), The Grand Cancún (TGCU) y Grand Punta Cana (TGPC), con los servicios **Alberca (pool)** y **Restaurante**.

---

## 6. Entregables

| Entregable | Descripción |
|---|---|
| Aplicación web | Next.js, cuatro pasos, desplegable con Docker (referencia) o Cloudflare Workers. |
| PDF vectorial | Hoja con piezas, medidas exactas en mm, 0 imágenes, compatible con Illustrator. |
| ZIP de SVG | Un SVG por pieza numerado (`001.svg`, `002.svg`…), con una capa por grupo. |
| Archivo de proyecto | `.qrproj.json` para guardar y reabrir el trabajo. |
| Documentación | Este charter, `ARCHITECTURE.md`, `specs/`, `ILLUSTRATOR.md`, auditorías de UX, `CHANGELOG.md`. |
| Suite de pruebas | Unitarias, de componentes, de integración y E2E (escritorio y móvil). |

---

## 7. Reglas de negocio y principios no negociables

### 7.1 Regla crítica del QR

> Un registro con **Link del QR** nunca genera un QR nuevo. Uno sin él genera un QR **una sola vez** y lo reutiliza.

Se refuerza en cuatro capas:

1. Un `qrUrl` aportado por el usuario **nunca** provoca una generación; si es inválido o inaccesible, es un error visible, nunca un respaldo que genere.
2. `/api/qr/resolve` rechaza en el servidor cualquier ítem con `qrUrl` o con `qr.source` distinto de `none`.
3. El cliente aplica un resultado solo si el registro no cambió desde que se pidió.
4. Un QR generado conserva su contenido: si cambia el Link del menú, el QR queda **desactualizado** y bloquea la exportación hasta elegir **Regenerar** o **Mantener** (con confirmación ligada que caduca al editar).

El servidor **no confía en el cliente**: recalcula la exportabilidad y la identidad de cada QR antes de dibujar.

### 7.2 Formato de la pieza (fijo)

| Aspecto | Valor |
|---|---|
| Tamaño | **70 × 70 mm** |
| Tipografía de las piezas | **Address Sans Pro Cd Semibold** (condensada; no se admite la «SemiBold» de ancho normal) |
| Tinta | **#000000** (negro puro, RGB) |
| Marco | 0.5 pt |
| Textos fijos | «CONSULTA EL MENÚ Y ORDENA EN LÍNEA» / «LOOK AT THE MENU AND ORDER ON LINE» |
| QR | 33 módulos de ≈ 0.75 mm de referencia, corrección de errores **H**, sin zona de silencio en la plantilla de referencia |

### 7.3 Tipografías y licencias

- **Gotham** se usa **solo en la interfaz** (por decisión del cliente). **Address Sans Pro Cd** se usa en las piezas y vive solo en el servidor; el navegador recibe contornos, nunca la fuente.
- Ambas son fuentes **comerciales: no se versionan** (`bun run fonts:setup` las instala desde la máquina y verifica su sha256).

### 7.4 Link estable del QR

El QR no codifica el destino sino un link estable que responde **302** al destino vigente. Hay dos:

- **Por resort y servicio:** `{dominio}/api/qr/{resortCode}/{servicio}`; cambiar el destino es editar `src/lib/resorts/properties.ts`.
- **Link corto del menú:** `{dominio}/s/{código}`. Todo «Link del menú» se acorta **siempre** (decisión del cliente, para mantener un estándar). El código sale de una huella del link: subir otra vez el mismo Excel da los mismos links cortos. Los links propios (`/s/…` y `/api/qr/…`) no se vuelven a acortar. El destino se cambia desde la aplicación («Cambiar destino») con historial, sin tocar el QR ya impreso.

El dominio (`NEXT_PUBLIC_QR_DOMAIN`) queda grabado en cada pieza: debe ser **permanente**. Sin acortar, un link de 150 caracteres produce un QR de 65 × 65 módulos de 0.38 mm (la exportación se bloquea por debajo de 0.45 mm); con el link corto son 41 × 41 módulos de 0.605 mm, o 29 × 29 de 0.855 mm con un dominio corto.

### 7.5 Otros principios (constitución)

Una sola fuente de verdad y capas estrictas; salida vectorial verificable; validación en cada frontera sin nada silencioso; seguridad por defecto; pruebas como contrato (no se debilitan para llegar a verde). Ver [la constitución](../.specify/memory/constitution.md).

---

## 8. Requisitos

### 8.1 Funcionales, por paso del flujo

| Paso | Ruta | Funcionalidad |
|---|---|---|
| **1 · Piezas** | `/editor`, `/import` | Crear, editar, duplicar, mover, eliminar y buscar piezas; verificación y estado del QR; importar Excel/CSV con mapeo de columnas y duplicados; **acortado automático del Link del menú**, cambio de destino y **descarga del Excel actualizado**; informe de errores. |
| **2 · Estilo del QR** | `/style` | Contorno cuadrado/circular; seis formas de módulo; forma del marco y centro de las esquinas; colores propios; logo SVG (tamaño, espacio libre, color); vista previa en vivo (solo el QR y en la pieza); avisos de legibilidad; deshacer y rehacer. |
| **3 · Diseño** | `/preview` | Mover y redimensionar el QR y el bloque de texto (ratón, teclado y coordenadas en mm), imán y rejilla, plantilla y ajustes de texto, deshacer y rehacer, descargar el SVG de una pieza. |
| **4 · Exportar** | `/export` | Resumen, nombre del archivo, tamaño de hoja y márgenes, sangrado, formato (PDF y/o ZIP de SVG), visor de hojas, progreso, cancelación y **Descargar**. |

**Inicio (`/`):** solo retoma el proyecto abierto o empieza uno (crear, importar, abrir `.qrproj.json`).

### 8.2 Estilo del QR (resumen)

- **Módulos:** cuadrado, redondeado, muy redondeado, puntos, hoja, hoja suave.
- **Esquinas:** marco y centro: cuadrado, redondeado o círculo.
- **Colores:** módulos, marco, centro y fondo; «Automático» hereda el de la plantilla.
- **Logo:** SVG saneado en el servidor (solo geometría con relleno); 5–30 % del lado del QR; margen de 0–3 módulos.
- **Legibilidad:** contraste (< 4.5:1 avisa, < 3:1 **bloquea**), QR invertido (avisa) y logo grande (> 20 % avisa, > 30 % **bloquea**, porque la corrección H recupera ≈ 30 %). Un bloqueo deshabilita la descarga y el servidor lo rechaza también.
- **Principio:** el estilo solo cambia cómo se dibuja la matriz; el contenido y el archivo guardado del QR no cambian.

### 8.3 No funcionales

| Categoría | Requisito |
|---|---|
| **Rendimiento** | 1000 piezas (QR + PDF + descarga) ≈ 10.5 s, PDF de ≈ 0.9 MiB con texto vivo; límite de 5000 piezas por exportación; memoria plana por *streaming*. |
| **Seguridad** | Guardas en toda ruta; autenticación obligatoria en producción; CSRF; anti DNS-rebinding; límites de tamaño y de peticiones; saneado de SVG externos. |
| **Disponibilidad** | Una réplica en el MVP; apagado ordenado (SIGTERM termina lo en curso y rechaza lo nuevo). |
| **Usabilidad** | Un solo propósito por pantalla; mensajes en español que dicen qué pasó y cómo recuperarse; botones de acción con nombre claro. |
| **Responsive** | Escritorio y móvil (390 × 844 verificado en pruebas); sin desborde horizontal; objetivos táctiles de 44 px con puntero grueso. |
| **Accesibilidad** | Meta WCAG 2.2 AA: foco visible, enlace «Saltar al contenido», un `h1` por página, `lang="es"`, `prefers-reduced-motion`. Auditoría con axe: 0 violaciones en 9 estados × 2 tamaños. Pendiente: lector de pantalla real. |
| **Compatibilidad** | PDF/SVG compatibles con Adobe Illustrator (verificación manual pendiente), Figma e Inkscape. |
| **Mantenibilidad** | TypeScript estricto, capas impuestas por ESLint, documentación por funcionalidad. |

---

## 9. Solución

### 9.1 Visión general

```
Navegador (React 19, MUI + Tailwind)
  ├─ Estado: Zustand (proyecto + sesión) ─ IndexedDB, archivo .qrproj.json
  ├─ Editor visual (SVG propio, geometría en mm) y vista previa en vivo
  └─ Cliente HTTP: vista previa por lotes, resolución de QR, exportación en streaming
            │ HTTPS (Route Handlers con withApiGuards)
Servidor (Next.js 16, Node 24)
  ├─ /api/import/excel   → guard ZIP + SheetJS en worker → pipeline puro de importación
  ├─ /api/qr/resolve     → generar o verificar QR (regla crítica) → Storage
  ├─ /api/preview/tiles  → pieza dibujada (contornos de la fuente de las piezas)
  ├─ /api/export         → PDF (pdfkit) + ZIP de SVG (fflate) en streaming con frames
  ├─ /api/qr/logo        → saneado del SVG del logo
  └─ /api/qr/{resort}/{servicio} → 302 al destino vigente (público)
            │
Storage (S3-compatible / R2 / local):  qr/v1/{sha256}.svg · qr/ext/v1/{sha256}.json
```

### 9.2 Capas y reglas de importación

| Capa | Contenido | Regla |
|---|---|---|
| `src/lib/` | Núcleo isomórfico: dominio, QR, escena, SVG, estilo, importación pura | Sin `fs`, sin `server-only`, sin React. |
| `src/server/` | Entorno, guardas HTTP, storage, Excel, PDF, fuentes | Solo Node; `import 'server-only'`. |
| `src/components/` | Interfaz y pantallas | No importa `src/server/**` (lo impone ESLint). |
| `src/schemas/` · `src/types/` | Validación Zod y tipos de dominio | Una sola fuente de verdad. |
| `src/templates/` | Plantillas como datos versionados | `tropical-table` (70 × 70), `restaurant-default`, `custom-template` (esqueleto). |

### 9.3 Pipeline vectorial

Un modelo intermedio único, **`TileScene`** (en mm), alimenta tres salidas con la misma geometría:

- `renderSceneSvg` → vista previa, SVG por pieza y ZIP.
- `PdfSheetWriter` (pdfkit) → PDF vectorial (primitivas directas; no se parsea SVG).
- Texto en **contornos** por defecto en la vista previa y, según la opción, texto **vivo** con la fuente incrustada.

El QR de una pieza es **un único path compuesto**. Con estilo, `styledQrNodes` genera fondo, módulos, marcos, pupilas y logo con solo comandos `M L C Z` absolutos. Con el estilo por defecto la salida es idéntica byte a byte a la clásica.

### 9.4 Regla del QR y almacenamiento

- Clave direccionada por contenido: `qr/v1/{sha256(contenido + opciones + renderer)}.svg`, subida con `If-None-Match: *`. Reintentos, pestañas duplicadas o reimportaciones no crean archivos nuevos.
- El `qrUrl` de un QR generado **se deriva** de la clave; el servidor comprueba `contenido → hash → clave → qrUrl` antes de imprimir.
- Los QR existentes de terceros se verifican una vez y se guarda su geometría saneada (`qr/ext/v1/…json`): la exportación no sale a la red.
- Exportar **nunca** escribe en el storage ni crea QR.

### 9.5 Importación

Excel: validación estricta del contenedor ZIP, reconstrucción de un ZIP limpio y lectura con SheetJS en un `worker_threads` con límites de memoria y tiempo; CSV con decodificación UTF-8/Windows-1252 y detección de delimitador. Límites: 10 MB, 5000 filas, 300 000 celdas. Por encima de las filas se rechaza, con la opción explícita «Importar solo las primeras N».

### 9.6 Exportación y descarga

`POST /api/export` devuelve un **stream binario con frames** (progreso → metadatos → chunks → fin → avisos/errores). La descarga tiene tres fases con progreso real («Generando PDF…», «Preparando descarga…», «Descargando…») y se cancela con `AbortController`. Un servidor ocupado responde 429 sin encolar; hay límite de tiempo (60 s por defecto).

### 9.7 Estado y persistencia

Zustand con un store de proyecto (autoguardado en IndexedDB a los 200 ms) y uno de sesión; archivo `.qrproj.json`; **un único escritor entre pestañas** (Web Locks) y modo de solo lectura en las demás. Lo ilegible va a **cuarentena por registro**: nunca se descarta un proyecto entero. Deshacer y rehacer cubren layout, ajustes de plantilla (incluido el estilo del QR) y opciones de exportación.

---

## 10. Tecnologías empleadas

### 10.1 Plataforma y lenguaje

| Tecnología | Versión | Uso |
|---|---|---|
| **Next.js** (App Router, `output: standalone`, Route Handlers) | 16.3.8 | Aplicación y API. Sin Server Actions: la descarga necesita streaming y cancelación. |
| **React** | 19.2.8 | Interfaz. |
| **TypeScript** | 5 (estricto) | Sin `any`, sin `@ts-ignore`. |
| **Node.js** | 24 en producción (≥ 22.12 admitido) | Runtime del servidor y del build. |
| **Bun** | 1.4.2 | **Solo** gestor de paquetes y ejecución de scripts; `bun.lock` es el único lockfile. |

### 10.2 Interfaz

| Tecnología | Versión | Uso |
|---|---|---|
| **MUI** (+ Emotion, `@mui/material-nextjs`) | 9.4 | Componentes, accesibilidad y tema (único origen de los tokens de color). |
| **Tailwind CSS** | 4 | Layout, espaciado y responsive (capas CSS ordenadas con MUI). |
| **Gotham** (fuente) | 3.301 | Tipografía de la **interfaz** (no versionada). |
| **@tanstack/react-virtual** | 3.14 | Visor de hojas y miniaturas virtualizados. |
| **@dnd-kit** | 6 / 10 | Reordenar piezas. |

### 10.3 Estado y datos

| Tecnología | Versión | Uso |
|---|---|---|
| **Zustand** | 5.0.15 | Estado de proyecto y de sesión. |
| **idb-keyval** | 6.3 | Persistencia en IndexedDB. |
| **Zod** | 4.6 | Validación y tipos en cada frontera (HTTP, formularios, Excel, hidratación). |

### 10.4 Núcleo vectorial, QR y documentos

| Tecnología | Versión | Uso |
|---|---|---|
| **qr** | 0.7.2 (exacta) | Solo la matriz del QR (corrección H); el SVG lo genera el proyecto. |
| **pdfkit** + **fontkit** | 0.20.2 / 2.0.4 | PDF vectorial y medición/contornos de texto. |
| **fflate** | 0.8 | ZIP de SVG y reconstrucción segura del ZIP de Excel. |
| **sharp** | 0.35 | Rasterizar para verificar y decodificar un QR existente (no disponible en Workers). |
| **@xmldom/xmldom** | 0.9 | Saneado de SVG externos y de logos (lista blanca). |
| **Address Sans Pro Cd Semibold** | — | Tipografía de las **piezas** (solo servidor; no versionada). |

### 10.5 Importación

| Tecnología | Versión | Uso |
|---|---|---|
| **SheetJS CE (`xlsx`)** | 0.20.3 desde el tarball del CDN | Lectura de `.xlsx`. La 0.18.5 de npm tiene CVE altas; `bun run check:sheetjs` avisa de versiones nuevas. |

### 10.6 Almacenamiento y despliegue

| Tecnología | Uso |
|---|---|
| **S3-compatible** (`@aws-sdk/client-s3` 3.1146) | AWS S3, Cloudflare R2 por API S3, Supabase, MinIO. |
| **Almacenamiento local** | Desarrollo y pruebas. |
| **Docker / Compose** | Despliegue de referencia: `node:24-trixie-slim` fijada por digest, usuario `node`, solo lectura salvo `/app/.data`, `HEALTHCHECK` en `/api/health`. |
| **Cloudflare Workers** (OpenNext + Wrangler, R2) | Segunda forma de despliegue (sin publicar); la exportación y la vista previa funcionan igual. |

### 10.7 Calidad y pruebas

| Herramienta | Versión | Uso |
|---|---|---|
| **Vitest** | 5 | Proyectos `unit`, `dom` (jsdom) e `integration`. |
| **Testing Library** | 16 | Pruebas de componentes. |
| **Playwright** | 1.63 | E2E en escritorio y móvil (390 × 844). |
| **ESLint** | 9 | Calidad y **capas de la arquitectura** (`no-restricted-imports`). |
| **pdf-lib**, **pdfjs-dist**, **jsqr** | — | Inspección de PDF y decodificación de QR en pruebas. |

---

## 11. Interfaces (API)

Todas, salvo las indicadas como públicas, pasan por `withApiGuards`: **host permitido → autenticación → Content-Type exacto y mismo origen (CSRF) → rate limit → semáforo → tamaño del cuerpo**.

| Endpoint | Método | Función |
|---|---|---|
| `/api/import/excel` | POST | Importar `.xlsx`/`.csv` (cuerpo binario; el archivo no se guarda). |
| `/api/qr/resolve` | POST | Generar o verificar QR por lotes (regla crítica). |
| `/api/qr/logo` | POST | Sanear el SVG del logo y devolver su geometría. |
| `/api/links/shorten` | POST | Acortar una lista de links del menú (máx. 200); idempotente. |
| `/api/links/{código}` | GET, PATCH | Consultar o cambiar el destino de un link corto (con historial). |
| `/api/records/excel` | POST | Excel actualizado del proyecto: link corto en «Link del menú» y destino de referencia. |
| `/s/{código}` | GET | **Pública:** redirect 302 al destino vigente del link corto. |
| `/api/preview/tiles` | POST | Piezas dibujadas (contornos) para la vista previa. |
| `/api/export` | POST | Exportación en *streaming*: PDF y/o ZIP de SVG. |
| `/api/qr/asset?key=…` | GET | Geometría saneada de un QR existente (instantánea `qr/ext/v1/…json`), para la vista previa. |
| `/api/storage/[...key]` | GET | Sirve archivos de QR (solo con storage local o R2; solo claves de QR). |
| `/api/qr/{resortCode}/{servicio}` | GET | **Pública:** redirect 302 al destino vigente. |
| `/api/health` | GET | **Pública:** salud (503 durante el apagado ordenado). |

---

## 12. Seguridad

- **Autenticación:** `AUTH_MODE` = `basic` o `proxy` en producción; con `none` el servidor **no arranca**. Contraseña como SHA-256 (`bun run hash-password`); secretos con variante `*_FILE`.
- **Validación de entorno** al arrancar con Zod: si falta algo o es inseguro, termina mostrando **todos** los problemas.
- **Cabeceras** (CSP, `X-Frame-Options`, etc.) en `next.config.ts`.
- **Descargas externas** solo vía `safeFetch` (https, IP públicas, tamaños y tiempos acotados); **SVG** externos y logos con lista blanca: se rechazan, no se ignoran.
- **Excel:** guard del contenedor ZIP, reconstrucción limpia y *worker* con límites.
- **Los QR generados nunca se versionan** en git; los secretos tampoco.
- **Fuentes comerciales** fuera del repositorio.

---

## 13. Calidad y pruebas

**Puertas de calidad** (un cambio no está terminado hasta que pasan): `bun run lint`, `bun run typecheck`, `bun run test` y `bun run build`.

| Capa | Qué cubre | Estado verificado |
|---|---|---|
| Unitarias, de componentes e integración | Dominio, QR, escena, SVG/PDF, importación, API real con guardas y storage, estilo del QR | **1033 pruebas pasan** (84 archivos, 2026-10-13) |
| E2E (Playwright) | Flujo de cuatro pasos, importación, editor, exportación, estilo del QR; escritorio y móvil | **90 pasan, 12 omitidas por diseño, 0 fallos** (bitácora, 2026-10-12) |
| Legibilidad del QR | Cada forma, esquina, color, contorno circular y logo se rasteriza y se **decodifica**; con control negativo (contraste casi nulo no se lee) | Pasa |
| Lint | Calidad y capas | 0 errores (4 advertencias conocidas) |
| Accesibilidad | axe-core | 0 violaciones en 9 estados × 2 tamaños |

Cobertura mínima configurada: 85 % de líneas en `lib`, `server` y `schemas`. No se borran, saltan ni debilitan pruebas o umbrales para llegar a verde.

---

## 14. Plan y estado por fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Arquitectura | ✓ aprobada (2026-10-06) |
| 2 | Scaffolding, infraestructura y guardas | ✓ |
| 3 | Modelo de dominio y validación | ✓ |
| 4 | Núcleo vectorial: QR, texto, escena, SVG y PDF | ✓ (falta verificación manual en Illustrator) |
| 5 | QR y storage (regla crítica de extremo a extremo) | ✓ |
| 6 | Estado, document builder y formulario manual | ✓ |
| 7 | Importación de Excel y CSV | ✓ (faltan libros reales de Excel 365, Google Sheets y LibreOffice) |
| 8 | Editor visual (`/preview`) | ✓ |
| 9 | Exportación en el servidor (`POST /api/export`) | ✓ |
| 10 | Descarga con progreso y cancelación | ✓ |
| — | Link estable del QR por resort y servicio | ✓ |
| — | Flujo por pasos (stepper) y visor del PDF | ✓ |
| — | Paso «Estilo del QR» (forma, esquinas, colores, logo) | ✓ |
| — | Acortador de links del menú (`/s/{código}`) y Excel actualizado | ✓ (Fase A) |
| — | Integración con la otra plataforma y Supabase (links, registro de QR, imágenes privadas, roles) | diseñada; pendiente de la integración |
| — | Revisión de UX y accesibilidad (auditorías y correcciones) | ✓ |
| — | Despliegue en Cloudflare Workers | ✓ en local; **sin publicar** |
| **11** | Testing integral y endurecimiento (carga de 1000/5000 piezas, importaciones concurrentes, revisión de seguridad) | **pendiente** |
| **12** | Pulido y documentación (incluye modo oscuro) | **pendiente** |

---

## 15. Supuestos, restricciones y dependencias

**Supuestos**

- El equipo de producción trabaja sobre todo en escritorio, con HTTPS (necesario para el contexto seguro del navegador).
- Una instancia atiende al equipo (MVP con una réplica).
- El dominio del QR será permanente y estará controlado por la organización.

**Restricciones**

- Las piezas son de 70 × 70 mm con tipografía y tinta fijas.
- Gotham solo en la interfaz; Address Sans Pro Cd solo en las piezas y en el servidor.
- Las fuentes comerciales no se versionan.
- Una pieza con Link del QR nunca genera ni estiliza un QR nuevo.

**Dependencias externas**

- Almacenamiento S3-compatible o R2 para los QR en producción (credenciales pendientes).
- Dominio definitivo y su enrutamiento de `/api/qr/*` con las rutas actuales de Palace.
- Licencias de fuentes confirmadas por legal o compras.
- Cuenta de Cloudflare y plan de pago de Workers (si se elige ese despliegue; el paquete pesa ≈ 4.3 MB comprimido).

---

## 16. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | El PDF no abre limpio en Illustrator (no se pudo automatizar la verificación). | Media | Alto | Script `illustrator-check.jsx` y guía [`ILLUSTRATOR.md`](ILLUSTRATOR.md); es una puerta de aceptación pendiente. |
| R2 | QR demasiado denso o estilizado que el taller no puede leer en el material real. | Media | Alto | Avisos y bloqueos de legibilidad; hoja de calibración y grabado de prueba; los umbrales de módulo son estimaciones hasta calibrar. |
| R3 | Licencias de Gotham o Address Sans Pro Cd no cubren uso en servidor o web. | Media | Alto | Confirmar con legal/compras antes de producción; las fuentes no se versionan. |
| R4 | Dominio del QR cambia después de grabar (links estables y cortos). | Baja | Muy alto | Dominio permanente grabado en cada pieza; destinos editables sin reimprimir. |
| R11 | El servicio de redirect (`/s/…`) cae y todos los QR dejan de funcionar. | Baja | Muy alto | Misma disponibilidad que la aplicación; Postgres administrado en la Fase B; Workers como segundo despliegue; vigilar el dominio. |
| R12 | Un destino mal editado rompe los QR ya impresos. | Media | Alto | Historial con el destino anterior y aviso explícito al editarlo. |
| R5 | Regresión de la regla crítica del QR. | Baja | Muy alto | Cuatro capas de defensa y pruebas que fallan al romperla; revisión obligatoria contra la constitución. |
| R6 | Libros de Excel reales con formatos no previstos. | Media | Medio | Rechazo explícito y mensajes claros; probar con Excel 365, Sheets y LibreOffice (pendiente). |
| R7 | El almacenamiento real (R2/Supabase) difiere de la simulación (escritura condicional). | Media | Medio | Verificar contra el servicio real antes de producción. |
| R8 | Límites de memoria o CPU de Workers con lotes grandes. | Media | Medio | Docker como referencia; medir antes de publicar en Workers. |
| R9 | Rutas públicas (`redirect`, `health`, `storage`) sin límite de peticiones. | Baja | Medio | Solo atienden destinos de una lista cerrada; evaluar un límite si se expone. |
| R10 | Una sola réplica y almacenamiento de proyecto en el navegador del usuario. | Media | Medio | Guardar el `.qrproj.json`; MVP declarado; evolución a base de datos documentada. |

---

## 17. Pendientes y decisiones abiertas

**Verificaciones manuales**

1. Abrir un PDF/SVG en **Illustrator** y ejecutar `scripts/illustrator-check.jsx`.
2. **Taller:** grabar la hoja de calibración en el material real y anotar la versión de QR más densa que se lee.
3. Probar con **libros reales** de Excel 365, Google Sheets y LibreOffice (`tests/fixtures/real/`).
4. Verificar el **almacenamiento real** (R2 o Supabase): escritura condicional y metadatos.
5. Probar **Docker** y el apagado ordenado (`docker build`, `--read-only`, 503 de `/api/health`).
6. **Accesibilidad:** contraste AA y lector de pantalla real.
7. **Licencias:** Gotham (interfaz, uso web) y Address Sans Pro Cd (servidor).

**Decisiones abiertas**

- **Dominio definitivo del QR** y coordinación con las rutas de Palace.
- Si los destinos de los resorts pasan de archivo a **base de datos** (hoy cambiar uno requiere un deploy). Los links cortos ya se guardan como datos y se editan desde la aplicación.
- **Dominio corto** para el link del QR (24 caracteres en lugar de ≈ 48: módulo de 0.855 mm en lugar de 0.605 mm).
- **Integración con la otra plataforma (Supabase):** links y registro de QR en Postgres, imágenes de QR en un bucket privado (accesibles solo con permisos), roles para crear y cambiar destinos. Diseño en `specs/011-acortador-de-links/plan.md`.
- **Duplicados contra links largos:** importar el Excel original después del actualizado no reconoce las piezas ya importadas (se continúa con el Excel actualizado).
- Si la **vista previa del PDF** debe mostrar siempre los QR: hoy, en miniaturas y con zoom bajo, el visor pide las piezas en baja definición y **omite el QR**; se solicitó mostrarlos siempre y está sin implementar.
- Si el estilo debe aplicarse también a las piezas con Link del QR (hoy no, por la regla crítica).
- Publicación en Cloudflare Workers y sus límites reales.
- Qué opciones de exportación hoy solo por API (CMYK, línea de corte, tinta plana) se exponen en la interfaz.

Detalle y seguimiento en [`specs/PENDIENTES.md`](../specs/PENDIENTES.md).

---

## 18. Gobernanza y método de trabajo

- **Spec primero (Spec Kit):** toda feature nueva pasa por `specify → clarify → plan → tasks → implement`, con `analyze` antes de implementar. Las funcionalidades existentes están documentadas en [`specs/`](../specs/README.md) (001–010).
- **Constitución:** reglas que no se negocian (§7); los cambios en la regla del QR, el link estable o el pipeline vectorial se revisan contra ella antes de fusionarse.
- **Ramas y commits:** en español, con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`, `merge:`), uno por cambio coherente; las ramas largas se integran con `merge`.
- **Trazabilidad:** `docs/ARCHITECTURE.md` (decisiones y plan por fases), `CHANGELOG.md` (bitácora con riesgos y verificaciones) y las auditorías de UX, redacción y flujo.
- **Reporte:** el trabajo se entrega por fases con un informe por fase y las decisiones aprobadas por el cliente.

---

## 19. Glosario

| Término | Significado |
|---|---|
| **Pieza** | Una placa de metal de 70 × 70 mm con sus textos y su QR. |
| **Registro** | Los datos de una pieza (Área, Estación, Mesa, Sub-grupo, Concepto, links). |
| **Link del menú** | Destino al que lleva el QR (puede ser el link estable por resort y servicio). |
| **Link del QR** | Un QR ya existente aportado por el usuario; se verifica y **no se regenera**. |
| **Generado / Existente / Desactualizado** | Estados del QR de un registro. Desactualizado = el Link del menú cambió desde que se generó. |
| **Link estable** | `{dominio}/api/qr/{resortCode}/{servicio}`: lo que codifica el QR; redirige al destino vigente. |
| **TileScene** | Representación intermedia única de una pieza (mm) que alimenta la vista previa, el SVG y el PDF. |
| **Plantilla** | Estructura de la pieza como datos versionados; el usuario ajusta un subconjunto validado. |
| **Estilo del QR** | Forma, esquinas, colores y logo con que se dibuja la matriz del QR. |
| **Corrección de errores H** | Nivel más alto del QR: tolera ≈ 30 % de módulos perdidos (permite el logo). |
| **Módulo** | Cada cuadro del QR; su tamaño físico determina si el taller puede leerlo. |
| **Contornos** | Texto convertido en trazos: no depende de fuentes instaladas. |
| **Stepper** | Navegación en pasos: Piezas → Estilo del QR → Diseño → Exportar. |
| **Spec Kit** | Método de especificación → plan → tareas → implementación usado en el proyecto. |

---

## 20. Documentación relacionada

| Documento | Contenido |
|---|---|
| [`README.md`](../README.md) | Instalación, scripts, variables de entorno, Docker y cómo probar cada fase. |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Arquitectura completa, modelo de datos, estrategias transversales y registro de decisiones. |
| [`docs/ILLUSTRATOR.md`](ILLUSTRATOR.md) | Verificación manual de los archivos en Illustrator. |
| [`docs/AUDITORIA-UX.md`](AUDITORIA-UX.md), [`AUDITORIA-REDACCION.md`](AUDITORIA-REDACCION.md), [`AUDITORIA-FLUJO.md`](AUDITORIA-FLUJO.md) | Auditorías de interfaz, textos y flujo. |
| [`specs/`](../specs/README.md) | Especificación, plan y tareas por funcionalidad (001–010 y F001–F004). |
| [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) | Principios no negociables. |
| [`PRODUCT.md`](../PRODUCT.md) · [`DESIGN.md`](../DESIGN.md) | Contexto de producto y sistema visual. |
| [`CHANGELOG.md`](../CHANGELOG.md) | Bitácora de cambios, riesgos y verificaciones. |

---

## 21. Aprobaciones

| Rol | Nombre | Fecha | Firma |
|---|---|---|---|
| Patrocinador / cliente | | | |
| Responsable del proyecto | | | |
| Líder técnico | | | |
| Producción / taller | | | |
| Legal / compras (licencias) | | | |
