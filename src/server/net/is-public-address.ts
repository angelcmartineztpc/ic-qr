import ipaddr from "ipaddr.js";

/**
 * ¿Es una dirección pública y alcanzable de Internet? Todo lo demás (privada,
 * loopback, link-local —incluido el servicio de metadatos 169.254.169.254—,
 * CGNAT, multicast, reservada, documentación, ULA…) se bloquea. Las IPv6 con una
 * IPv4 incrustada (mapeada, NAT64 y 6to4) se evalúan por esa IPv4, para que
 * `::ffff:127.0.0.1` no sirva de rodeo.
 */
export function isPublicAddress(input: string): boolean {
  const literal = input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input;
  if (!ipaddr.isValid(literal)) return false;
  const address = ipaddr.process(literal); // convierte IPv4-mapped a IPv4

  if (address.kind() === "ipv4") return address.range() === "unicast";

  const v6 = address as ipaddr.IPv6;
  const range = v6.range();
  const parts = v6.parts;
  const embedded = (a: number, b: number) => `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`;
  if (range === "rfc6052") return isPublicAddress(embedded(parts[6] ?? 0, parts[7] ?? 0)); // NAT64 64:ff9b::/96
  if (range === "6to4") return isPublicAddress(embedded(parts[1] ?? 0, parts[2] ?? 0)); // 2002:AABB:CCDD::
  return range === "unicast";
}
