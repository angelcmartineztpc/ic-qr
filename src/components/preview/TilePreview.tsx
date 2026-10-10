"use client";

import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import { memo } from "react";

import { describeLayoutWarning } from "@/lib/errors/messages.es";
import type { QRRecord } from "@/types";

import { svgDataUrl as dataUrl, useTile } from "./useTile";

/** Pieza dibujada por el servidor (contornos de la tipografía de la pieza). Se muestra como <img>: el SVG nunca ejecuta nada. */
export const TilePreview = memo(function TilePreview({ record, detail = "full", className = "" }: { record: QRRecord; detail?: "full" | "low"; className?: string }) {
  const { result, error } = useTile(record, detail);

  const title = `Vista previa de la pieza ${[record.mesa, record.area].filter(Boolean).join(" · ") || "sin nombre"}`;
  const warnings = result?.warnings ?? [];

  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/10 ${className}`}>
      {result ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG generado por el servidor; next/image no aporta nada aquí
        <img src={dataUrl(result.svg)} alt={title} className="h-full w-full select-none" draggable={false} />
      ) : error ? (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-error">
          <ErrorIcon fontSize="small" />
          {error}
        </div>
      ) : (
        <Skeleton variant="rectangular" className="!h-full !w-full" role="img" aria-label="Cargando vista previa" />
      )}
      {warnings.length > 0 ? (
        <Tooltip title={<ul className="m-0 list-disc pl-4">{warnings.map((w, i) => <li key={i}>{describeLayoutWarning(w)}</li>)}</ul>} arrow>
          <span className="absolute left-1 top-1 inline-flex rounded-full bg-white/90 p-0.5 text-warning" role="img" aria-label={`${warnings.length} aviso(s) de composición`}>
            <WarningAmberIcon fontSize="small" />
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
});
