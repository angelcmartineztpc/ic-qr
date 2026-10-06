export type Service = "pool" | "restaurant";
export type SpotType = "mesa" | "camastro";

export interface Property {
  id: string;
  name: string;
  resortCode: string;
  serviceUrls: Record<Service, string>;
}

const BASE = "https://pool-service.palaceresorts.com";
const urls = (code: string): Record<Service, string> => ({
  pool: `${BASE}/pool-area/${code}`,
  restaurant: `${BASE}/restaurant/${code}`,
});

export const properties: Property[] = [
  { id: "cancun", name: "Cancún", resortCode: "TGCU", serviceUrls: urls("TGCU") },
  { id: "riviera", name: "Riviera", resortCode: "TGPR", serviceUrls: urls("TGPR") },
  { id: "grand-punta-cana", name: "Grand Punta Cana", resortCode: "TGPC", serviceUrls: urls("TGPC") },
];

export class PropertyError extends Error {}

export function getProperty(id: string): Property {
  const p = properties.find((x) => x.id === id);
  if (!p) throw new PropertyError(`Unknown property: ${id}`);
  return p;
}

export function getPropertyByCode(code: string): Property {
  const p = properties.find((x) => x.resortCode === code);
  if (!p) throw new PropertyError(`Unknown resort code: ${code}`);
  return p;
}

export function isService(v: string): v is Service {
  return v === "pool" || v === "restaurant";
}

// URL estable que va grabada en el QR; redirige a property.serviceUrls[service].
export function buildServiceUrl(property: Property, service: Service): string {
  if (!property.serviceUrls[service]) throw new PropertyError(`Unknown service: ${service}`);
  const domain = process.env.QR_DOMAIN?.replace(/\/+$/, "");
  if (!domain) throw new Error("QR_DOMAIN is not set");
  return `${domain}/api/qr/${property.resortCode}/${service}`;
}
