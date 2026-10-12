export type Service = "pool" | "restaurant";

export interface Property {
  id: string;
  name: string;
  resortCode: string;
  serviceUrls: Record<Service, string>;
}

const BASE = "https://pool-service.palaceresorts.com";
const make = (id: string, name: string, resortCode: string): Property => ({
  id,
  name,
  resortCode,
  serviceUrls: {
    pool: `${BASE}/pool-area/${resortCode}`,
    restaurant: `${BASE}/restaurant/${resortCode}`,
  },
});

export const SERVICES: readonly Service[] = ["pool", "restaurant"];
export const SERVICE_LABELS: Record<Service, string> = { pool: "Alberca (pool)", restaurant: "Restaurante" };

export const properties: readonly Property[] = [
  make("playacar", "Playacar", "PRPL"),
  make("leblanc-cancun", "LeBlanc Cancún", "LBCU"),
  make("leblanc-los-cabos", "LeBlanc Los Cabos", "LBLC"),
  make("moon-palace-sunrise", "Moon Palace Sunrise", "MPCU"),
  make("moon-palace-nizuc", "Moon Palace Nizuc", "MPNI"),
  make("beach-palace", "Beach Palace", "PRBP"),
  make("cozumel", "Cozumel", "PRCZ"),
  make("grand-cancun", "The Grand Cancún", "TGCU"),
  make("grand-punta-cana", "Grand Punta Cana", "TGPC"),
];

export const isService = (v: string): v is Service => (SERVICES as readonly string[]).includes(v);

export const findPropertyByCode = (code: string): Property | undefined => properties.find((p) => p.resortCode === code);

/** URL estable que va en el QR: `{domain}/api/qr/{resortCode}/{service}`; esa ruta redirige a `serviceUrls[service]`. */
export function buildServiceUrl(property: Property, service: Service, domain: string): string {
  return `${domain.replace(/\/+$/, "")}/api/qr/${property.resortCode}/${service}`;
}
