import { qrErrorMessage } from "@/lib/errors/messages.es";
import type { QRRecord } from "@/types";

import { qrBlocker } from "./qr-state";

export type BadgeTone = "default" | "info" | "success" | "warning" | "error";
export type BadgeIcon = "pending" | "generating" | "ok" | "sync" | "warning" | "info" | "error";

/** Acciones que la persona puede elegir sobre el QR de una pieza (botones en la tarjeta). */
export type QrAction = "regenerate" | "keep" | "use-anyway" | "retry" | "replace" | "generate" | "verify";

export interface QrBadge {
  label: string;
  tone: BadgeTone;
  icon: BadgeIcon;
  tooltip?: string;
  /** Bloquea la exportación hasta resolverse. */
  blocking: boolean;
  actions: QrAction[];
}

/**
 * UNA sola tabla para toda la interfaz (spec §30 y §37; docs/ARCHITECTURE.md §S7):
 * "QR pendiente", "✓ QR generado", "✓ QR existente"… siempre visibles.
 */
export function qrBadge(record: QRRecord, inFlight = false): QrBadge {
  const qr = record.qr;

  if (record.qrError) {
    const code = record.qrError.code;
    const actions: QrAction[] = qr.source === "existing" ? ["retry", "replace"] : ["retry"];
    return { label: `✕ Error de QR: ${code}`, tone: "error", icon: "error", tooltip: qrErrorMessage(code, record.qrError.message), blocking: true, actions };
  }
  if (inFlight && qr.source !== "generated") {
    return qr.source === "existing"
      ? { label: "QR existente · verificando", tone: "info", icon: "sync", blocking: true, actions: [] }
      : { label: "Generando QR…", tone: "info", icon: "generating", blocking: true, actions: [] };
  }

  switch (qr.source) {
    case "none":
      return { label: "QR pendiente (vista previa)", tone: "default", icon: "pending", tooltip: "Se generará al guardar la pieza o al pulsar «Generar QR pendientes»", blocking: true, actions: ["generate"] };

    case "generated": {
      const stale = qr.payload !== record.menuUrl;
      if (!stale) return { label: "✓ QR generado", tone: "success", icon: "ok", tooltip: "Guardado en el almacenamiento; no se volverá a generar", blocking: false, actions: [] };
      return qrBlocker(record) === null
        ? { label: "QR anterior mantenido", tone: "warning", icon: "info", tooltip: "El Link del menú cambió; se imprimirá el QR anterior (confirmado)", blocking: false, actions: ["regenerate"] }
        : { label: "⚠ QR desactualizado", tone: "warning", icon: "warning", tooltip: "El Link del menú cambió después de generar el QR: apunta a la URL anterior", blocking: true, actions: ["regenerate", "keep"] };
    }

    case "existing": {
      if (qr.verification === "unchecked") return { label: "QR existente · verificando", tone: "info", icon: "sync", tooltip: "Aún no se ha comprobado el archivo del QR", blocking: true, actions: ["verify"] };
      const blocker = qrBlocker(record);
      if (blocker === "existing-mismatch") return { label: "⚠ QR existente apunta a otra URL", tone: "warning", icon: "warning", tooltip: `El QR lee: ${qr.decodedPayload ?? "?"}`, blocking: true, actions: ["use-anyway", "replace"] };
      if (blocker === "existing-undecodable") return { label: "⚠ QR existente ilegible", tone: "warning", icon: "warning", tooltip: "No se pudo leer el contenido del QR", blocking: true, actions: ["use-anyway", "verify"] };
      const confirmed = record.qrAck !== undefined;
      return confirmed
        ? { label: "QR existente (confirmado por el usuario)", tone: "warning", icon: "info", blocking: false, actions: ["verify"] }
        : { label: "✓ QR existente", tone: "success", icon: "ok", tooltip: "Se usa exactamente el archivo del Link del QR", blocking: false, actions: [] };
    }
  }
}
