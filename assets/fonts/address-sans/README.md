# Address Sans Pro Cd Semibold

Tipografía de las **piezas** (la de `QR_Tropical_1M_Alimentos.pdf` y `QR_Alimentos.ai`; decisión del 2026-10-07).
El `.woff2` **no se versiona** (licencia de Adobe Fonts). Para instalarlo en tu copia local:

```bash
bun run fonts:setup            # busca ~/Library/Fonts y la caché de Adobe Fonts (CoreSync/livetype)
FONTS_SOURCE_DIR=/ruta bun run fonts:setup
```

`fonts:setup` la busca por su nombre PostScript (`AddressSansPro-CdSemibold`), la convierte a `.woff2` si
está en otf/ttf (o con el nombre opaco de la caché de Adobe) y la deja en esta carpeta.

## Cuidado: no es la misma que «Address Sans Pro SemiBold»

La **Cd** es una fuente condensada distinta; «Address Sans Pro SemiBold» (ancho normal) no es una versión
escalada de ella y con esa las piezas salen más anchas y no coinciden con la referencia.
`manifest.json` guarda una **huella de anchos** (avance por 1000 em de M, T, O, A, 0 y 1) tomada de la fuente
incrustada en `QR_Alimentos.ai`; `fonts:setup` rechaza cualquier archivo que no la cumpla y lo dice.

Para conseguirla: abre `QR_Alimentos.ai` en Illustrator con Creative Cloud y activa la fuente faltante desde
Adobe Fonts, o pídela a quien hizo el diseño.

`manifest.json` también fija el sha256 cuando se instala con `bun run fonts:setup --write-manifest`.
El build de Docker copia esta carpeta: ejecuta `fonts:setup` antes de `docker build`.
