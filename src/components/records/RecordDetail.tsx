"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import HubIcon from "@mui/icons-material/Hub";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { shortCodeOf } from "@/lib/links/own-links";
import { inspectRecordQrAsset, type SharedQrCatalogSummary } from "@/lib/qr/shared-catalog";
import { qrBadge } from "@/lib/records/qr-badge";
import { useSession } from "@/lib/state/StoreProvider";
import { FIELD_LABELS } from "@/lib/validation/messages.es";
import type { QRRecord } from "@/types";

import { LinkDestination } from "@/components/links/LinkDestination";
import { TilePreview } from "@/components/preview/TilePreview";

import type { BuilderActions } from "./builder-actions";
import { QrStatusBadge } from "./QrStatusBadge";
import { RecordQrActions } from "./RecordQrActions";

interface Props {
  record: QRRecord;
  /** Posición en la lista visible (1-based) y tamaño de esa lista. */
  position: number;
  total: number;
  readOnly: boolean;
  actions: BuilderActions;
  catalog?: SharedQrCatalogSummary;
  onEdit(): void;
  onMove(): void;
  onPrevious(): void;
  onNext(): void;
}

const EMPTY = (
  <span className="text-muted">
    <span aria-hidden>—</span>
    <span className="sr-only">Sin dato</span>
  </span>
);

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-sm text-muted">{name}</dt>
      <dd className="m-0 min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/** Inspector de pieza (spec §12): barra superior de navegación y acciones, mesa de trabajo 70×70 mm y ficha técnica con activo QR reutilizable. */
export function RecordDetail({ record, position, total, readOnly, actions, catalog, onEdit, onMove, onPrevious, onNext }: Props) {
  const issues = record.validationErrors.filter((i) => i.severity !== "info");
  const inFlight = useSession((s) => s.inFlight.includes(record.id));
  const qrExplanation = qrBadge(record, inFlight).tooltip;
  const assetInfo = inspectRecordQrAsset(record, catalog);
  const title = [record.mesa, record.area].filter(Boolean).join(" · ") || "Sin nombre";

  const link = (url: string | undefined) =>
    url ? (
      <Link href={url} target="_blank" rel="noopener noreferrer" underline="hover">
        {url}
      </Link>
    ) : (
      EMPTY
    );

  return (
    <section
      aria-label="Pieza seleccionada"
      className="overflow-hidden rounded-t-[28px] rounded-b-xl border border-divider bg-surface shadow-xs"
    >
      {/* Cabecera del inspector: navegación rápida a la izquierda, CTA primario Editar + iconos cuadrados con tooltip a la derecha */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-background/60 px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex h-9 items-center gap-1 rounded-full border border-divider bg-surface px-1.5"
            role="navigation"
            aria-label="Navegar entre piezas"
          >
            <IconButton size="small" onClick={onPrevious} disabled={position <= 1} aria-label="Pieza anterior">
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
            <Typography component="p" variant="body2" aria-live="polite" data-testid="piece-position" className="px-1.5 font-semibold tabular-nums">
              Pieza {position} de {total}
            </Typography>
            <IconButton size="small" onClick={onNext} disabled={position >= total} aria-label="Pieza siguiente">
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-base font-bold text-foreground">{title}</strong>
            <QrStatusBadge record={record} size="medium" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="contained"
            startIcon={<EditIcon fontSize="small" />}
            onClick={onEdit}
            disabled={readOnly}
            className="!h-9 !rounded-full !px-4"
          >
            Editar
          </Button>
          <div className="flex items-center gap-1" role="group" aria-label="Acciones secundarias de la pieza">
            <Tooltip title="Descargar SVG">
              <IconButton
                size="small"
                aria-label="Descargar SVG"
                onClick={() => void actions.downloadPieceSvg(record.id)}
                className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-surface text-muted hover:!text-foreground"
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Duplicar pieza">
              <span>
                <IconButton
                  size="small"
                  aria-label="Duplicar"
                  onClick={() => actions.duplicate(record.id)}
                  disabled={readOnly}
                  className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-surface text-muted hover:!text-foreground"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Mover de posición">
              <span>
                <IconButton
                  size="small"
                  aria-label="Mover"
                  onClick={onMove}
                  disabled={readOnly}
                  className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-surface text-muted hover:!text-foreground"
                >
                  <DriveFileMoveIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Eliminar pieza">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label="Eliminar"
                  onClick={() => void actions.remove([record.id])}
                  disabled={readOnly}
                  className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-surface"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Cuerpo dividido: Mesa de trabajo 70×70 mm a la izquierda, Ficha técnica y Activo QR a la derecha */}
      <div className="grid md:grid-cols-[minmax(0,18.5rem)_1fr]">
        <div className="flex flex-col items-center justify-center gap-2.5 bg-background p-5 md:border-r md:border-divider">
          <div className="w-full max-w-[16rem]">
            <TilePreview record={record} />
          </div>
          <span className="text-xs font-medium text-muted">Mesa de trabajo · 70 × 70 mm vectorial</span>
        </div>

        <div className="flex min-w-0 flex-col gap-4 p-5">
          {/* Bloque 1: Textos impresos en la placa */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Textos impresos en placa</span>
            <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-divider bg-background/40 p-3.5 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted">{FIELD_LABELS.area}</dt>
                <dd className="m-0 break-words text-sm font-medium">{record.area || EMPTY}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted">{FIELD_LABELS.estacion}</dt>
                <dd className="m-0 break-words text-sm font-medium">{record.estacion || EMPTY}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted">{FIELD_LABELS.mesa}</dt>
                <dd className="m-0 break-words text-sm font-medium">{record.mesa || EMPTY}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted">{FIELD_LABELS.subgrupo}</dt>
                <dd className="m-0 break-words text-sm font-medium">{record.subgrupo || EMPTY}</dd>
              </div>
              <div className="flex min-w-0 flex-col sm:col-span-2">
                <dt className="text-xs text-muted">{FIELD_LABELS.concepto}</dt>
                <dd className="m-0 break-words text-sm font-medium">{record.concepto || EMPTY}</dd>
              </div>
            </dl>
          </div>

          {/* Bloque 2: Activo QR reutilizable (Multi-proyecto) */}
          <div className="flex flex-col gap-2.5 rounded-lg border border-divider bg-background/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <HubIcon sx={{ fontSize: 16 }} className="text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Activo QR (Multi-proyecto)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {assetInfo.shortCode ? (
                  <Chip size="small" variant="outlined" className="!rounded-full" label={`Código corto: /s/${assetInfo.shortCode}`} />
                ) : null}
                {assetInfo.isSharedInBatch ? (
                  <Chip
                    size="small"
                    color="info"
                    variant="outlined"
                    className="!rounded-full"
                    label={`Compartido en ${assetInfo.sharedCount} piezas de este lote`}
                  />
                ) : (
                  <Chip size="small" variant="outlined" className="!rounded-full" label="Reutilizable en otros proyectos" />
                )}
              </div>
            </div>

            {qrExplanation ? <p className="m-0 text-sm text-muted">{qrExplanation}</p> : null}
            <RecordQrActions record={record} actions={actions} />

            <dl className="m-0 divide-y divide-divider border-t border-divider pt-1">
              <Field name={FIELD_LABELS.menuUrl}>{record.menuUrl ? link(record.menuUrl) : EMPTY}</Field>
              <Field name={FIELD_LABELS.qrUrl}>{link(record.qrUrl)}</Field>
            </dl>
            {shortCodeOf(record.menuUrl) ? <LinkDestination code={shortCodeOf(record.menuUrl) as string} readOnly={readOnly} /> : null}
          </div>

          {issues.length > 0 ? (
            <Alert severity={issues.some((i) => i.severity === "error") ? "error" : "warning"}>
              <ul className="m-0 list-disc pl-4">
                {issues.map((issue, i) => (
                  <li key={i}>{issue.message}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {record.qrError ? <Alert severity="error">{record.qrError.message}</Alert> : null}
        </div>
      </div>
    </section>
  );
}

