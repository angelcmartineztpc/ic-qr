import { CircleAlert, TriangleAlert } from "lucide-react";
import { memo } from "react";

import { Skeleton, Tooltip } from "@/components/qr-produccion/ui";
import { describeLayoutWarning } from "@/services/qr-produccion/errors/messages.es";
import type { QRRecord } from "@/types";

import styles from "./TilePreview.module.css";
import { svgDataUrl as dataUrl, useTile } from "./useTile";

/** Pieza dibujada por el servidor (contornos de la tipografía de la pieza). Se muestra como <img>: el SVG nunca ejecuta nada. */
export const TilePreview = memo(function TilePreview({ record, detail = "full", className = "" }: { record: QRRecord; detail?: "full" | "low"; className?: string }) {
  const { result, error } = useTile(record, detail);

  const title = `Vista previa de la pieza ${[record.mesa, record.area].filter(Boolean).join(" · ") || "sin nombre"}`;
  const warnings = result?.warnings ?? [];

  return (
    <div className={`${styles.tile} ${className}`.trim()}>
      {result ? (
        <img src={dataUrl(result.svg)} alt={title} className={styles.image} draggable={false} />
      ) : error ? (
        <div role="alert" className={styles.error}>
          <CircleAlert size={18} aria-hidden />
          {error}
        </div>
      ) : (
        <Skeleton variant="rectangular" className={styles.skeleton} role="img" aria-label="Cargando vista previa" />
      )}
      {warnings.length > 0 ? (
        <span className={styles.warning}>
          <Tooltip
            title={
              <ul className={styles.warningList}>
                {warnings.map((w, i) => (
                  <li key={i}>{describeLayoutWarning(w)}</li>
                ))}
              </ul>
            }
            arrow
          >
            <span className={styles.warningIcon} role="img" aria-label={`${warnings.length} aviso(s) de composición`}>
              <TriangleAlert size={18} />
            </span>
          </Tooltip>
        </span>
      ) : null}
    </div>
  );
});
