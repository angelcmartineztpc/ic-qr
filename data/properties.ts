export type SpotType = 'mesa' | 'camastro';
export type ServiceType = 'pool' | 'restaurant';

export interface Property {
  id: string;           // "playacar"
  name: string;         // "Playacar"
  resortCode: string;   // "PRPL"
  services: {
    pool: string;       // URL base para bebidas
    restaurant: string; // URL base para alimentos y bebidas
  };
}

/**
 * Construye URL para el QR
 * La UI envía: propiedad, tipo (mesa/camastro), número, y servicio
 * Ejemplo: https://pool-service.palaceresorts.com/pool-area/PRPL?camastro=101
 */
export function buildQRUrl(
  property: Property,
  spotType: SpotType,
  spotNumber: number,
  serviceType: ServiceType = 'pool'
): string {
  const baseUrl =
    serviceType === 'pool' ? property.services.pool : property.services.restaurant;
  return `${baseUrl}?${spotType}=${spotNumber}`;
}

export const properties: Property[] = [
  {
    id: 'playacar',
    name: 'Playacar',
    resortCode: 'PRPL',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/PRPL',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/PRPL',
    },
  },
  {
    id: 'leblanc-cancun',
    name: 'LeBlanc Cancún',
    resortCode: 'LBCU',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/LBCU',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/LBCU',
    },
  },
  {
    id: 'leblanc-los-cabos',
    name: 'LeBlanc Los Cabos',
    resortCode: 'LBLC',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/LBLC',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/LBLC',
    },
  },
  {
    id: 'moon-palace-sunrise',
    name: 'Moon Palace Sunrise',
    resortCode: 'MPCU',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/MPCU',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/MPCU',
    },
  },
  {
    id: 'moon-palace-nizuc',
    name: 'Moon Palace Nizuc',
    resortCode: 'MPNI',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/MPNI',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/MPNI',
    },
  },
  {
    id: 'beach-palace',
    name: 'Beach Palace',
    resortCode: 'PRBP',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/PRBP',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/PRBP',
    },
  },
  {
    id: 'cozumel',
    name: 'Cozumel',
    resortCode: 'PRCZ',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/PRCZ',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/PRCZ',
    },
  },
  {
    id: 'grand-cancun',
    name: 'The Grand Cancún',
    resortCode: 'TGCU',
    services: {
      pool: 'https://pool-service.palaceresorts.com/pool-area/TGCU',
      restaurant: 'https://pool-service.palaceresorts.com/restaurant/TGCU',
    },
  },
];