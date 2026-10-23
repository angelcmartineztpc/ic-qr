import { SafeFetchError, type SafeFetchDeps } from "./safe-fetch";

/**
 * Transporte de `safeFetch` sobre `fetch` (Deno / Edge Functions). Sin redirecciones automáticas (las sigue
 * `safeFetch`, revalidando cada salto), sin cuerpo mayor que `maxBytes` (se corta el stream al pasarse) y con
 * el cuerpo leído por trozos. A diferencia del transporte de Node NO puede fijar la IP validada en la conexión:
 * `fetch` vuelve a resolver el nombre (ventana de DNS rebinding documentada en supabase/README.md).
 */
export function makeFetchTransport(fetchImpl: typeof fetch = fetch): SafeFetchDeps["transport"] {
  return async ({ url, signal, maxBytes }) => {
    const response = await fetchImpl(url.href, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { "accept-encoding": "identity", accept: "image/svg+xml,image/*;q=0.8,*/*;q=0.5", "user-agent": "QRProductionGenerator/1.0" },
    });
    const headers: Record<string, string | undefined> = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });

    const tooLarge = () => new SafeFetchError("too-large", `El recurso supera ${maxBytes} bytes`);
    const declared = Number(headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      throw tooLarge();
    }
    if (!response.body) return { status: response.status, headers, body: new Uint8Array(0) };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: response.status, headers, body };
  };
}
