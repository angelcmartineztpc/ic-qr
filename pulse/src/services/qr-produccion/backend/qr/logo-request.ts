import { HttpError } from "../http/errors";
import { sanitizeLogo } from "./logo";

/**
 * POST qr-logo — cuerpo = el SVG del logo. Responde la geometría saneada (paths y rectángulos con relleno)
 * que el navegador guarda en el estilo del QR. No guarda nada en el storage ni genera ningún QR.
 */
export function runLogo(bytes: Uint8Array) {
  if (bytes.length === 0) throw new HttpError(400, "BAD_REQUEST", "El archivo está vacío");
  const outcome = sanitizeLogo(bytes);
  if (!outcome.ok) throw new HttpError(400, "VALIDATION_FAILED", outcome.message);
  return { geometry: outcome.geometry };
}
