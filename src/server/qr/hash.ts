import "server-only";

import { createHash } from "node:crypto";

import { hashInput } from "@/lib/qr/hash-input";

export const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** sha256 de la entrada canónica: determina la clave del archivo en el storage. */
export const contentHashOf = (payload: string): string => sha256Hex(hashInput(payload));
