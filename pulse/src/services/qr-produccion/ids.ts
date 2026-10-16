/**
 * Identificadores de registro (UUID v4). crypto.randomUUID solo existe en
 * contextos seguros (HTTPS/localhost); getRandomValues está disponible siempre.
 */
export function newRecordId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // contexto no seguro: se usa el fallback
    }
  }
  return uuidV4FromBytes(cryptoApi.getRandomValues(new Uint8Array(16)));
}

export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error("Se necesitan 16 bytes para un UUID");
  const b = Uint8Array.from(bytes);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // versión 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
