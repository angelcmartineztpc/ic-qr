# Gotham

Tipografía de las piezas (decisión R2 de `docs/ARCHITECTURE.md`).

Los archivos `.otf` **no se versionan**: Gotham tiene licencia comercial de Hoefler & Co.
Para instalarlos en tu copia local:

```bash
bun run fonts:setup                              # copia desde ~/Library/Fonts
FONTS_SOURCE_DIR=/ruta/a/gotham bun run fonts:setup
```

`manifest.json` (sí versionado) fija el sha256 de cada archivo, así todos los entornos
usan exactamente la misma versión. Si cambias de versión de Gotham, ejecuta
`bun run fonts:setup --write-manifest` y commitea el manifest.

El build de Docker copia esta carpeta al contexto: ejecuta `fonts:setup` antes de `docker build`.
