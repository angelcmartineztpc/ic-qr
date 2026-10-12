import { HttpError } from "./errors";

/**
 * Lee el cuerpo con un límite de bytes. Rechaza por Content-Length sin leer y
 * corta también los cuerpos chunked que superan el límite.
 * Es la única forma permitida de leer cuerpos en src/app/api (regla ESLint).
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", `El cuerpo supera el máximo de ${maxBytes} bytes`);
  }
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", `El cuerpo supera el máximo de ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Cuerpo JSON con límite; los errores de sintaxis se devuelven como 400. */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBodyCapped(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "El cuerpo no es JSON válido");
  }
}
