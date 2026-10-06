"use client";

import Button from "@mui/material/Button";

import { qrBadge, type QrAction } from "@/lib/records/qr-badge";
import { useSession } from "@/lib/state/StoreProvider";
import type { QRRecord } from "@/types";

import type { BuilderActions } from "./builder-actions";

const LABELS: Record<QrAction, string> = {
  regenerate: "Regenerar QR",
  keep: "Mantener QR anterior",
  "use-anyway": "Usar de todos modos",
  retry: "Reintentar",
  replace: "Reemplazar por QR generado",
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
    <div className="flex flex-wrap gap-2">
      {list.map((action) => (
        <Button key={action} size="small" variant={action === "regenerate" || action === "generate" || action === "retry" ? "contained" : "outlined"} onClick={run[action]} disabled={inFlight}>
          {LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
