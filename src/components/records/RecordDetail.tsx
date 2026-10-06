"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
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

const EMPTY = <span className="text-muted">—</span>;

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
  const link = (url: string | undefined) =>
    url ? (
      <Link href={url} target="_blank" rel="noopener noreferrer" underline="hover">
        {url}
      </Link>
    ) : (
      EMPTY
    );

  return (
    <section aria-label="Pieza seleccionada" className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="flex flex-col gap-2">
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
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <QrStatusBadge record={record} size="medium" />
        </div>
        <RecordQrActions record={record} actions={actions} />

        <dl className="m-0 divide-y divide-divider">
          <Field name={FIELD_LABELS.area}>{record.area || EMPTY}</Field>
          <Field name={FIELD_LABELS.estacion}>{record.estacion || EMPTY}</Field>
          <Field name={FIELD_LABELS.mesa}>{record.mesa || EMPTY}</Field>
          <Field name={FIELD_LABELS.subgrupo}>{record.subgrupo || EMPTY}</Field>
          <Field name={FIELD_LABELS.concepto}>{record.concepto || EMPTY}</Field>
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

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="contained" startIcon={<EditIcon />} onClick={onEdit} disabled={readOnly}>
            Editar
          </Button>
          <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => actions.duplicate(record.id)} disabled={readOnly}>
            Duplicar
          </Button>
          <Button variant="outlined" startIcon={<DriveFileMoveIcon />} onClick={onMove} disabled={readOnly}>
            Mover a…
          </Button>
          <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => void actions.remove([record.id])} disabled={readOnly}>
            Eliminar
          </Button>
        </div>
      </div>
    </section>
  );
}
