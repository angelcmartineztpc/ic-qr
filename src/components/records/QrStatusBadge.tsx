"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import InfoIcon from "@mui/icons-material/Info";
import SyncIcon from "@mui/icons-material/Sync";
import WarningIcon from "@mui/icons-material/Warning";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import type { ReactElement } from "react";

import { qrBadge, type BadgeIcon, type BadgeTone } from "@/lib/records/qr-badge";
import { useSession } from "@/lib/state/StoreProvider";
import type { QRRecord } from "@/types";

const ICONS: Record<BadgeIcon, ReactElement> = {
  pending: <HourglassEmptyIcon />,
  generating: <CircularProgress size={14} />,
  ok: <CheckCircleIcon />,
  sync: <SyncIcon />,
  warning: <WarningIcon />,
  info: <InfoIcon />,
  error: <ErrorIcon />,
};

const COLOR: Record<BadgeTone, "default" | "info" | "success" | "warning" | "error"> = { default: "default", info: "info", success: "success", warning: "warning", error: "error" };

/** Una sola etiqueta de estado del QR para toda la interfaz (spec §30, §37). */
export function QrStatusBadge({ record, size = "small" }: { record: QRRecord; size?: "small" | "medium" }) {
  const inFlight = useSession((s) => s.inFlight.includes(record.id));
  const badge = qrBadge(record, inFlight);
  // Las etiquetas del spec ya llevan su símbolo (✓ ⚠ ✕): no se duplica con un icono.
  const hasSymbol = /^[✓⚠✕]/u.test(badge.label);
  const chip = <Chip size={size} color={COLOR[badge.tone]} variant={badge.tone === "default" ? "outlined" : "filled"} {...(hasSymbol ? {} : { icon: ICONS[badge.icon] })} label={badge.label} data-testid="qr-status" className="max-w-full" />;
  return badge.tooltip ? (
    <Tooltip title={badge.tooltip} arrow>
      <span className="inline-flex max-w-full">{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
