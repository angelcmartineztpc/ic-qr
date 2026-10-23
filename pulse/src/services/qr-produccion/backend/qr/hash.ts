import { hashInput } from "@/services/qr-produccion/qr/hash-input";

import { sha256Hex } from "../util/sha256";

export { sha256Hex };

/** sha256 de la entrada canónica: determina la clave del archivo en el storage. */
export const contentHashOf = (payload: string): string => sha256Hex(hashInput(payload));
