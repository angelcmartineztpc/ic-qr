/**
 * ¿Es una dirección pública y alcanzable de Internet? Todo lo demás (privada,
 * loopback, link-local —incluido el servicio de metadatos 169.254.169.254—,
 * CGNAT, multicast, reservada, documentación, ULA…) se bloquea. Las IPv6 con una
 * IPv4 incrustada (mapeada, NAT64 y 6to4) se evalúan por esa IPv4, para que
 * `::ffff:127.0.0.1` no sirva de rodeo.
 *
 * Implementación propia (sin ipaddr.js) para que corra igual en Deno y en las pruebas.
 * IPv4: lista de rangos reservados. IPv6: lista BLANCA (solo 2000::/3 menos los
 * rangos especiales), de modo que lo que no se conoce se bloquea.
 */

export function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^(0|[1-9]\d{0,2})$/.test(p) ? Number(p) : Number.NaN));
  return octets.every((n) => n >= 0 && n <= 255) ? octets : null;
}

/** 8 grupos de 16 bits, o null si no es una IPv6 válida (sin zona `%`). */
export function parseIPv6(text: string): number[] | null {
  if (!text.includes(":") || text.includes("%")) return null;
  let head = text;
  let tail: number[] = [];
  // IPv4 incrustada al final (`::ffff:1.2.3.4`): ocupa los dos últimos grupos.
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = [((v4[0] as number) << 8) | (v4[1] as number), ((v4[2] as number) << 8) | (v4[3] as number)];
    head = text.slice(0, lastColon + 1);
    if (!head.endsWith("::")) head = head.slice(0, -1);
  }
  const group = (g: string): number => (/^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN);
  const expand = (side: string): number[] | null => {
    if (side === "") return [];
    const groups = side.split(":").map(group);
    return groups.some(Number.isNaN) ? null : groups;
  };

  const doubles = head.split("::");
  if (doubles.length > 2) return null;
  let groups: number[];
  if (doubles.length === 2) {
    const left = expand(doubles[0] as string);
    const right = expand(doubles[1] as string);
    if (!left || !right) return null;
    const missing = 8 - left.length - right.length - tail.length;
    if (missing < 1) return null;
    groups = [...left, ...Array<number>(missing).fill(0), ...right, ...tail];
  } else {
    const all = expand(head);
    if (!all) return null;
    groups = [...all, ...tail];
  }
  return groups.length === 8 ? groups : null;
}

const inCidr4 = (o: readonly number[], base: readonly number[], bits: number): boolean => {
  const value = ((o[0] as number) * 2 ** 24 + (o[1] as number) * 2 ** 16 + (o[2] as number) * 256 + (o[3] as number)) >>> 0;
  const start = ((base[0] as number) * 2 ** 24 + (base[1] as number) * 2 ** 16 + (base[2] as number) * 256 + (base[3] as number)) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (start & mask) >>> 0;
};

const RESERVED_V4: ReadonlyArray<readonly [number[], number]> = [
  [[0, 0, 0, 0], 8], // «esta red»
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16], // link-local (metadatos de la nube)
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 0, 2, 0], 24],
  [[192, 88, 99, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reservada y broadcast
];

const isPublicV4 = (octets: readonly number[]): boolean => !RESERVED_V4.some(([base, bits]) => inCidr4(octets, base, bits));

const embedded = (a: number, b: number): string => `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`;

function isPublicV6(g: readonly number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  // IPv4 mapeada (::ffff:a.b.c.d): se evalúa como IPv4.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return isPublicAddress(embedded(g6, g7));
  // NAT64 64:ff9b::/96
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicAddress(embedded(g6, g7));
  // 6to4 2002::/16 lleva la IPv4 en los grupos 1 y 2.
  if (g0 === 0x2002) return isPublicAddress(embedded(g1, g2));
  // Lista blanca: solo unicast global 2000::/3…
  if ((g0 & 0xe000) !== 0x2000) return false;
  // …sin Teredo y asignaciones del IETF (2001::/23), documentación (2001:db8::/32 y 3fff::/20).
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  if ((g0 & 0xfff0) === 0x3ff0 || (g0 === 0x3fff && (g1 & 0xf000) === 0)) return false;
  return true;
}

export function isPublicAddress(input: string): boolean {
  const literal = input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input;
  const v4 = parseIPv4(literal);
  if (v4) return isPublicV4(v4);
  const v6 = parseIPv6(literal);
  return v6 ? isPublicV6(v6) : false;
}

/** ¿El texto es una IP literal (v4 o v6)? */
export const isIpLiteral = (host: string): boolean => {
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return parseIPv4(literal) !== null || parseIPv6(literal) !== null;
};
