import { CircleAlert, CircleCheck, Hourglass, Info, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";

import { Chip, CircularProgress, Tooltip } from "@/components/qr-produccion/ui";
import { qrBadge, type BadgeIcon, type BadgeTone } from "@/services/qr-produccion/records/qr-badge";
import { useSession } from "@/services/qr-produccion/state/StoreProvider";
import type { QRRecord } from "@/types";

import styles from "./QrStatusBadge.module.css";

const ICONS: Record<BadgeIcon, ReactElement> = {
  pending: <Hourglass size={14} />,
  generating: <CircularProgress size={14} />,
  ok: <CircleCheck size={14} />,
  sync: <RefreshCw size={14} />,
  warning: <TriangleAlert size={14} />,
  info: <Info size={14} />,
  error: <CircleAlert size={14} />,
};

const COLOR: Record<BadgeTone, "default" | "info" | "success" | "warning" | "error"> = { default: "default", info: "info", success: "success", warning: "warning", error: "error" };

/** Una sola etiqueta de estado del QR para toda la interfaz (spec §30, §37). */
export function QrStatusBadge({ record, size = "small" }: { record: QRRecord; size?: "small" | "medium" }) {
  const inFlight = useSession((s) => s.inFlight.includes(record.id));
  const badge = qrBadge(record, inFlight);
  // Las etiquetas del spec ya llevan su símbolo (✓ ⚠ ✕): no se duplica con un icono.
  const hasSymbol = /^[✓⚠✕]/u.test(badge.label);
  const chip = <Chip size={size} color={COLOR[badge.tone]} variant={badge.tone === "default" ? "outlined" : "filled"} {...(hasSymbol ? {} : { icon: ICONS[badge.icon] })} label={badge.label} data-testid="qr-status" className={styles.chip} />;
  return badge.tooltip ? (
    <Tooltip title={badge.tooltip} arrow>
      <span className={styles.wrap}>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
