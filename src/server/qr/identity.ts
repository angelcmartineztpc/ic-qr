import "server-only";

import { externalSnapshotKey, qrStorageKey } from "@/lib/qr/hash-input";
import type { ExportRecord, StorageProvider } from "@/types";

import { contentHashOf } from "./hash";

export class QrIdentityError extends Error {
  readonly code = "QR_IDENTITY_MISMATCH" as const;
  constructor(
    readonly recordId: string,
    message: string,
  ) {
    super(message);
    this.name = "QrIdentityError";
  }
}

/**
 * Antes de dibujar, el servidor comprueba que el QR del registro es EXACTAMENTE
 * el archivo al que apunta (§S2.5): un IndexedDB corrupto, un .qrproj.json
 * editado a mano o un bug del cliente no pueden imprimir un QR distinto.
 */
export function verifyQrIdentity(record: ExportRecord, ctx: { storage: Pick<StorageProvider, "keyFromPublicUrl">; keyPrefix: string }): void {
  const fail = (message: string): never => {
    throw new QrIdentityError(record.id, message);
  };
  const qr = record.qr;
  if (qr.source === "generated") {
    const contentHash = contentHashOf(qr.payload);
    if (qr.contentHash !== contentHash) fail("El hash del QR no corresponde a su contenido");
    if (qr.storageKey !== qrStorageKey(contentHash, ctx.keyPrefix)) fail("La clave del QR no corresponde a su contenido");
    if (ctx.storage.keyFromPublicUrl(record.qrUrl) !== qr.storageKey) fail("El link del QR no apunta al archivo del QR");
  } else if (qr.source === "existing") {
    if (!qr.assetSha256 || qr.snapshotKey !== externalSnapshotKey(qr.assetSha256, ctx.keyPrefix)) fail("La instantánea del QR existente no corresponde a su huella");
  } else {
    fail("El registro no tiene QR");
  }
}
