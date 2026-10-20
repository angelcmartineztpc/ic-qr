"use client";

import HubIcon from "@mui/icons-material/Hub";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { summarizeQrCatalog } from "@/lib/qr/shared-catalog";
import { countRecords, type CounterFilter } from "@/lib/state/counters";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

/** Badge compacto del catálogo de activos QR reutilizables. */
export function QrCatalogBadge() {
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const catalog = useMemo(() => summarizeQrCatalog(records), [records]);

  return (
    <Tooltip title="Los enlaces cortos (/s/código) y archivos QR funcionan como activos independientes: puedes reutilizarlos en otros proyectos, reimpresiones o campañas sin volver a generarlos.">
      <div
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider bg-surface px-3 text-xs text-muted"
        data-testid="qr-catalog-summary"
      >
        <HubIcon sx={{ fontSize: 15 }} className="text-primary" />
        <span className="whitespace-nowrap">
          Catálogo QR:{" "}
          <strong className="font-semibold text-foreground tabular-nums">{catalog.uniqueAssets}</strong>{" "}
          {catalog.uniqueAssets === 1 ? "activo único" : "activos únicos"}
          {catalog.reusedInstances > 0 ? ` · ${catalog.reusedInstances} compartidos` : ""}
        </span>
      </div>
    </Tooltip>
  );
}

/** Contadores siempre visibles (spec §37). Cada uno es un filtro de la lista en formato píldora (Material 3 Expressive). */
export function RecordCounters({
  onFilter,
  embedded = false,
  showCatalog = true,
}: {
  onFilter(filter: CounterFilter): void;
  embedded?: boolean;
  showCatalog?: boolean;
}) {
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
    <div
      className={
        embedded
          ? "flex flex-wrap items-center gap-1.5"
          : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-surface px-4 py-2.5"
      }
      role="group"
      aria-label="Resumen de piezas"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => {
          const isActive = filter === item.key;
          return (
            <Chip
              key={item.key}
              size="small"
              label={`${item.label}: ${item.value}`}
              color={isActive ? "primary" : (item.color ?? "default")}
              variant={isActive ? "filled" : "outlined"}
              onClick={() => onFilter(isActive && item.key !== "all" ? "all" : item.key)}
              aria-pressed={isActive}
              data-testid={`counter-${item.key}`}
              className="!h-7 !rounded-full !px-1 !font-medium"
            />
          );
        })}
      </div>

      {showCatalog ? <QrCatalogBadge /> : null}
    </div>
  );
}


