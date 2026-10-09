"use client";

import Button from "@mui/material/Button";

import { qrBadge, type QrAction } from "@/lib/records/qr-badge";
import { useSession } from "@/lib/state/StoreProvider";
import type { QRRecord } from "@/types";

import type { BuilderActions } from "./builder-actions";

const LABELS: Record<QrAction, string> = {
  regenerate: "Crear un QR nuevo con el link actual",
  keep: "Imprimir el QR anterior (apunta al link viejo)",
  "use-anyway": "Usar este QR aunque apunte a otra dirección",
  retry: "Reintentar",
  replace: "Cambiar por un QR nuevo de esta app",
  generate: "Generar QR",
  verify: "Verificar de nuevo",
};

/** Botones de decisión sobre el QR de una pieza: nada se decide en silencio. */
export function RecordQrActions({ record, actions }: { record: QRRecord; actions: BuilderActions }) {
  const inFlight = useSession((s) => s.inFlight.includes(record.id));
  const list = qrBadge(record, inFlight).actions;
  if (list.length === 0) return null;
  const run: Record<QrAction, () => void> = {
    regenerate: () => void actions.regenerate(record.id),
    keep: () => actions.keepStale(record.id),
    "use-anyway": () => actions.useAnyway(record.id),
    retry: () => void actions.retry(record.id),
    replace: () => void actions.replaceWithGenerated(record.id),
    generate: () => void actions.resolve([record.id]),
    verify: () => void actions.verify(record.id),
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {list.map((action) => (
          <Button key={action} size="small" variant={action === "regenerate" || action === "generate" || action === "retry" ? "contained" : "outlined"} onClick={run[action]} disabled={inFlight}>
            {LABELS[action]}
          </Button>
        ))}
      </div>
      {list.some((a) => a === "regenerate" || a === "keep" || a === "replace" || a === "use-anyway") ? (
        <p className="m-0 text-sm text-muted">El QR que ya imprimiste no cambia: crear uno nuevo solo afecta a lo que imprimas a partir de ahora.</p>
      ) : null}
    </div>
  );
}
