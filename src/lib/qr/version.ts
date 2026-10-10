/**
 * Versión del renderer del QR. Forma parte de la clave de contenido: subirla
 * cambia las claves NUEVAS sin romper las antiguas. Un test con hash dorado
 * detecta cualquier cambio en la librería `qr` o en el renderer.
 */
export const QR_RENDERER_VERSION = "qrsvg-1+qr@0.7.2";

/** Zona de silencio del asset almacenado (ISO/IEC 18004: 4 módulos). */
export const QR_ASSET_MARGIN_MODULES = 4;
