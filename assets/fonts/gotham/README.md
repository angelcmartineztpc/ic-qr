# Gotham

Tipografía de la **interfaz** (desde el 2026-10-07; las piezas usan `address-sans`).

Los archivos `.woff2` **no se versionan**: Gotham tiene licencia comercial de Hoefler & Co.
Para instalarlos en tu copia local:

```bash
bun run fonts:setup                              # busca por nombre PostScript en ~/Library/Fonts y la caché de Adobe Fonts
FONTS_SOURCE_DIR=/ruta/a/gotham bun run fonts:setup
```

Si encuentra la fuente en otf/ttf la convierte a `.woff2`; si ya es `.woff2`, la copia.

`manifest.json` (sí versionado) fija el sha256 de cada archivo, así todos los entornos
usan exactamente la misma versión. Si cambias de versión de Gotham, ejecuta
`bun run fonts:setup --write-manifest` y commitea el manifest.

El build de Docker copia esta carpeta al contexto: ejecuta `fonts:setup` antes de `docker build`.
