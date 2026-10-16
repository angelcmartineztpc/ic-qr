import { ChevronLeft, ChevronRight, Copy, Download, FolderInput, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { LinkDestination } from "@/components/qr-produccion/links/LinkDestination";
import { TilePreview } from "@/components/qr-produccion/preview/TilePreview";
import { Alert, Button, IconButton, Link } from "@/components/qr-produccion/ui";
import { shortCodeOf } from "@/services/qr-produccion/links/own-links";
import { qrBadge } from "@/services/qr-produccion/records/qr-badge";
import { useSession } from "@/services/qr-produccion/state/StoreProvider";
import { FIELD_LABELS } from "@/services/qr-produccion/validation/messages.es";
import type { QRRecord } from "@/types";

import type { BuilderActions } from "./builder-actions";
import { QrStatusBadge } from "./QrStatusBadge";
import { RecordQrActions } from "./RecordQrActions";
import styles from "./RecordDetail.module.css";

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
  <span className={styles.muted}>
    <span aria-hidden>—</span>
    <span className={styles.srOnly}>Sin dato</span>
  </span>
);

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldName}>{name}</dt>
      <dd className={styles.fieldValue}>{children}</dd>
    </div>
  );
}

function Summary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={styles.summary}>
      <dt className={styles.summaryName}>{name}</dt>
      <dd className={styles.summaryValue}>{children}</dd>
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
    <section aria-label="Pieza seleccionada" className={styles.detail}>
      <div className={styles.side}>
        <TilePreview record={record} />
        <div className={styles.nav} role="navigation" aria-label="Navegar entre piezas">
          <IconButton onClick={onPrevious} disabled={position <= 1} aria-label="Pieza anterior">
            <ChevronLeft size={24} />
          </IconButton>
          <p className={styles.position} aria-live="polite" data-testid="piece-position">
            Pieza {position} de {total}
          </p>
          <IconButton onClick={onNext} disabled={position >= total} aria-label="Pieza siguiente">
            <ChevronRight size={24} />
          </IconButton>
        </div>
        <div className={styles.buttons}>
          <Button variant="contained" startIcon={<Pencil size={18} />} onClick={onEdit} disabled={readOnly}>
            Editar
          </Button>
          <div className={styles.buttonGrid}>
            <Button variant="outlined" startIcon={<Copy size={18} />} onClick={() => actions.duplicate(record.id)} disabled={readOnly}>
              Duplicar
            </Button>
            <Button variant="outlined" startIcon={<FolderInput size={18} />} onClick={onMove} disabled={readOnly}>
              Mover
            </Button>
            <Button variant="outlined" startIcon={<Download size={18} />} onClick={() => void actions.downloadPieceSvg(record.id)}>
              Descargar SVG
            </Button>
            <Button variant="outlined" color="error" startIcon={<Trash2 size={18} />} onClick={() => void actions.remove([record.id])} disabled={readOnly}>
              Eliminar
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.main}>
        <div className={styles.badgeRow}>
          <QrStatusBadge record={record} size="medium" />
        </div>
        {qrExplanation ? <p className={styles.explanation}>{qrExplanation}</p> : null}
        <RecordQrActions record={record} actions={actions} />

        <dl className={styles.summaries}>
          <Summary name={FIELD_LABELS.area}>{record.area || EMPTY}</Summary>
          <Summary name={FIELD_LABELS.estacion}>{record.estacion || EMPTY}</Summary>
          <Summary name={FIELD_LABELS.mesa}>{record.mesa || EMPTY}</Summary>
          <Summary name={FIELD_LABELS.subgrupo}>{record.subgrupo || EMPTY}</Summary>
          <Summary name={FIELD_LABELS.concepto}>{record.concepto || EMPTY}</Summary>
        </dl>
        <dl className={styles.fields}>
          <Field name={FIELD_LABELS.menuUrl}>{record.menuUrl ? link(record.menuUrl) : EMPTY}</Field>
          <Field name={FIELD_LABELS.qrUrl}>{link(record.qrUrl)}</Field>
        </dl>
        {shortCodeOf(record.menuUrl) ? <LinkDestination code={shortCodeOf(record.menuUrl) as string} readOnly={readOnly} /> : null}

        {issues.length > 0 ? (
          <Alert severity={issues.some((i) => i.severity === "error") ? "error" : "warning"}>
            <ul className={styles.issues}>
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
