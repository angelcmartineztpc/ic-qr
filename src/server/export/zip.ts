import "server-only";

import { Zip, ZipDeflate } from "fflate";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * ZIP en streaming (fflate `Zip` + `ZipDeflate`): cada SVG se comprime y se
 * entrega al terminar, sin construir el archivo entero con `zipSync`. El orden
 * de las entradas es el de la lista exportada.
 */
export async function buildZip(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, onYield?: () => Promise<void>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk);
  });
  for await (const entry of entries) {
    const file = new ZipDeflate(entry.name, { level: 6 });
    zip.add(file);
    file.push(entry.data, true);
    if (failure) throw failure;
    await onYield?.();
  }
  zip.end();
  if (failure) throw failure;
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
