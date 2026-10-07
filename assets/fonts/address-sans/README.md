# Address Sans Pro Cd Semibold

Tipografía de las **piezas** (la de `QR_Tropical_1M_Alimentos.pdf`; decisión del 2026-10-07).
El `.otf` **no se versiona** (licencia de Adobe Fonts). Para instalarlo en tu copia local:

```bash
bun run fonts:setup            # busca ~/Library/Fonts y la caché de Adobe Fonts (CoreSync/livetype)
FONTS_SOURCE_DIR=/ruta bun run fonts:setup
```

`manifest.json` fija el sha256. El build de Docker copia esta carpeta: ejecuta `fonts:setup` antes de `docker build`.
