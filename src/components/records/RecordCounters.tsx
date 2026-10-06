"use client";

import Chip from "@mui/material/Chip";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { countRecords, type CounterFilter } from "@/lib/state/counters";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

/** Contadores siempre visibles (spec §37). Cada uno es un filtro de la lista. */
export function RecordCounters({ onFilter }: { onFilter(filter: CounterFilter): void }) {
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const excluded = useSession(useShallow((s) => s.excluded));
  const filter = useSession((s) => s.filter);
  const counts = useMemo(() => countRecords(records, new Set(excluded)), [records, excluded]);

  const items: Array<{ key: CounterFilter; label: string; value: number; color?: "success" | "warning" | "error" }> = [
    { key: "all", label: "Total", value: counts.total },
    { key: "withQr", label: "Con QR", value: counts.withQr, color: "success" },
    { key: "needQr", label: "Necesitan QR", value: counts.needQr, color: counts.needQr > 0 ? "warning" : undefined },
    { key: "errors", label: "Con errores", value: counts.withErrors, color: counts.withErrors > 0 ? "error" : undefined },
    ...(counts.excluded > 0 ? [{ key: "excluded" as const, label: "Excluidas", value: counts.excluded }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Resumen de piezas">
      {items.map((item) => (
        <Chip
          key={item.key}
          label={`${item.label}: ${item.value}`}
          color={item.color ?? "default"}
          variant={filter === item.key ? "filled" : "outlined"}
          onClick={() => onFilter(filter === item.key && item.key !== "all" ? "all" : item.key)}
          aria-pressed={filter === item.key}
          data-testid={`counter-${item.key}`}
        />
      ))}
    </div>
  );
}
