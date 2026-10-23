# QR Auditor

Audita masivamente los códigos QR de un PDF: los lee, abre cada URL y muestra en tiempo real qué funciona y qué no. Sin emuladores.

## Instalación

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
python run.py            # dashboard en http://127.0.0.1:8000
python cli.py piezas.pdf # sin interfaz; genera piezas-auditoria.csv y .xlsx
pytest                   # prueba end-to-end con PDF sintético y servidor local
```

## Estructura

```
qrauditor/
  models.py         Estados (QRStatus), filas del informe, resumen
  config.py         Zoom, hilos, concurrencia HTTP, timeouts
  pdf_extractor.py  PyMuPDF: página → PNG en gris + nombre de pieza
  qr_reader.py      OpenCV: decodifica varios QR por página, con reintentos
  url_validator.py  httpx async: HEAD→GET, redirecciones manuales, clasificación
  pipeline.py       Orquestación concurrente y eventos de progreso
  report.py         CSV (UTF-8 con BOM) y Excel
  server.py         FastAPI: POST /api/audit, SSE /events, /report.csv|xlsx
  static/           Dashboard (HTML + CSS + JS sin dependencias)
```

## Arquitectura

- **Capas con una responsabilidad**: extraer, leer, validar, orquestar, exportar. Solo `pipeline.py` conoce a las demás; el servidor y la CLI usan el mismo pipeline.
- **Concurrencia**: el renderizado y decodificación (CPU) corren en un `ThreadPoolExecutor` (OpenCV y PyMuPDF liberan el GIL; cada hilo abre su propio documento). La validación HTTP es `asyncio` + `httpx` con semáforo. Las URLs repetidas se validan una sola vez.
- **Lectura robusta**: ZXing-cpp como lector principal (módulos redondeados, logos, QR invertidos, sin margen) y OpenCV de respaldo; render a 3× y 5×, con variantes (margen añadido, desenfoque, binarizado, reducción).
- **Clasificación**: Correcto, Redirige a otro dominio (válido, se avisa), QR ilegible (detectado pero no decodificable), Sin QR, Contenido no es URL, URL rota (4xx/5xx), Tiempo agotado, Error de redirección (bucle o >8 saltos), Error de conexión.
- **Tiempo real**: el pipeline emite eventos; el servidor los transmite por Server-Sent Events.

## Diseño (Material 3 Expressive)

Formas asimétricas (esquinas 56/20 px que se invierten al interactuar), botones y chips en píldora, métricas en un bento con una esquina grande distinta por tarjeta, tipografía Bricolage Grotesque (títulos) + Figtree (texto), paleta tonal violeta/verde/ámbar/rojo con contenedores `*-container`. Tema claro/oscuro (respeta el del sistema).

Accesibilidad (WCAG AA): pares de color texto/contenedor de alto contraste, estado nunca solo por color (siempre texto), foco visible, objetivos ≥44 px, `role="progressbar"` y `aria-live` para el avance, tabla con región enfocable, enlace "saltar a resultados", `prefers-reduced-motion`.

## Notas

- Las fuentes se cargan de Google Fonts; sin conexión se usa la fuente del sistema.
- Algunos sitios bloquean HEAD o bots: se reintenta con GET; un 403 persistente se reporta como URL rota.
- Los PDFs se guardan en un directorio temporal solo mientras dura el servidor.
