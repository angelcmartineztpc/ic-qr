"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { FIELD_LABELS } from "@/lib/validation/messages.es";
import type { QRRecord } from "@/types";

import { TilePreview } from "@/components/preview/TilePreview";

import type { BuilderActions } from "./builder-actions";
import { qrBadge } from "@/lib/records/qr-badge";
import { useSession } from "@/lib/state/StoreProvider";

import { QrStatusBadge } from "./QrStatusBadge";
import { RecordQrActions } from "./RecordQrActions";

interface Props {
  record: QRRecord;
  /** Posición en la lista visible (1-based) y tamaño de esa lista. */
  position: number;
  total: number;
  readOnly: boolean;
  actions: BuilderActions;
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

/** Vista de una pieza (spec §12): «Pieza N de M», vista previa grande y todos sus datos. */
export function RecordDetail({ record, position, total, readOnly, actions, onEdit, onMove, onPrevious, onNext }: Props) {
  const issues = record.validationErrors.filter((i) => i.severity !== "info");
  const inFlight = useSession((s) => s.inFlight.includes(record.id));
  const qrExplanation = qrBadge(record, inFlight).tooltip;
  const link = (url: string | undefined) =>
    url ? (
      <Link href={url} target="_blank" rel="noopener noreferrer" underline="hover">
        {url}
      </Link>
    ) : (
      EMPTY
    );

  return (
    <section aria-label="Pieza seleccionada" className="grid rounded border border-divider bg-white md:grid-cols-[minmax(0,19rem)_1fr]">
      <div className="flex flex-col gap-3 bg-background p-5 md:border-r md:border-divider">
        <TilePreview record={record} />
        <div className="flex items-center justify-between gap-2" role="navigation" aria-label="Navegar entre piezas">
          <IconButton onClick={onPrevious} disabled={position <= 1} aria-label="Pieza anterior">
            <NavigateBeforeIcon />
          </IconButton>
          <Typography component="p" variant="body2" aria-live="polite" data-testid="piece-position">
            Pieza {position} de {total}
          </Typography>
          <IconButton onClick={onNext} disabled={position >= total} aria-label="Pieza siguiente">
            <NavigateNextIcon />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="contained" startIcon={<EditIcon />} onClick={onEdit} disabled={readOnly}>
            Editar
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => actions.duplicate(record.id)} disabled={readOnly}>
              Duplicar
            </Button>
            <Button variant="outlined" startIcon={<DriveFileMoveIcon />} onClick={onMove} disabled={readOnly}>
              Mover
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void actions.downloadPieceSvg(record.id)}>
              Descargar SVG
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => void actions.remove([record.id])} disabled={readOnly}>
              Eliminar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <QrStatusBadge record={record} size="medium" />
        </div>
        {qrExplanation ? <p className="m-0 text-sm text-muted">{qrExplanation}</p> : null}
        <RecordQrActions record={record} actions={actions} />

        <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3.5">
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
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted">{FIELD_LABELS.concepto}</dt>
            <dd className="m-0 break-words text-sm font-medium">{record.concepto || EMPTY}</dd>
          </div>
        </dl>
        <dl className="m-0 divide-y divide-divider border-t border-divider">
          <Field name={FIELD_LABELS.menuUrl}>{record.menuUrl ? link(record.menuUrl) : EMPTY}</Field>
          <Field name={FIELD_LABELS.qrUrl}>{link(record.qrUrl)}</Field>
        </dl>

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
    </section>
  );
}
