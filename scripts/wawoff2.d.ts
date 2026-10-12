declare module "wawoff2" {
  /** Convierte una fuente sfnt (otf/ttf) a WOFF2. */
  export function compress(data: Uint8Array): Promise<Uint8Array>;
  export function decompress(data: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { compress: typeof compress; decompress: typeof decompress };
  export default wawoff2;
}
