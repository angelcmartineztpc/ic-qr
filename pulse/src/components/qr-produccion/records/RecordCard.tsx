import { Copy, Download, EllipsisVertical, FolderInput, Pencil, Trash2 } from "lucide-react";
import { memo, useId, useState, type ReactNode } from "react";

import { TilePreview } from "@/components/qr-produccion/preview/TilePreview";
import { Card, CardActionArea, Chip, IconButton, ListItemIcon, Menu, MenuItem } from "@/components/qr-produccion/ui";
import { hasBlockingErrors } from "@/services/qr-produccion/validation/validate";
import type { QRRecord } from "@/types";

import { QrStatusBadge } from "./QrStatusBadge";
import styles from "./RecordCard.module.css";

export interface RecordCardHandlers {
  onSelect(id: string): void;
  onEdit(id: string): void;
  onDuplicate(id: string): void;
  onMove(id: string): void;
  onDelete(id: string): void;
  onDownloadSvg(id: string): void;
}

export interface RecordCardProps extends RecordCardHandlers {
  record: QRRecord;
  /** Posición (1-based) para mostrar «#12». */
  position: number;
  selected: boolean;
  /** Personalizada: tiene una posición propia del QR o del texto. */
  customized: boolean;
  readOnly: boolean;
  /** Elemento extra en la esquina (asa de arrastre). */
  leading?: ReactNode;
}

/** Tarjeta de una pieza: vista previa, datos clave, estado del QR y acciones. */
export const RecordCard = memo(function RecordCard({ record, position, selected, customized, readOnly, leading, onSelect, onEdit, onDuplicate, onMove, onDelete, onDownloadSvg }: RecordCardProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const title = [record.mesa, record.area].filter(Boolean).join(" · ") || "Sin nombre";
  const subtitle = [record.estacion, record.subgrupo, record.concepto].filter(Boolean).join(" · ");
  const errors = record.validationErrors.filter((e) => e.severity === "error").length;
  const run = (fn: (id: string) => void) => () => {
    setAnchor(null);
    fn(record.id);
  };

  return (
    <Card variant="outlined" className={`${styles.card} ${selected ? styles.selected : ""}`} data-testid="record-card" data-record-id={record.id} aria-current={selected ? "true" : undefined}>
      <CardActionArea onClick={() => onSelect(record.id)} className={styles.area}>
        <div aria-hidden>
          <TilePreview record={record} />
        </div>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <strong className={styles.title} title={title}>
              {title}
            </strong>
            <span className={styles.position}>#{position}</span>
          </div>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          <div className={styles.chips}>
            <QrStatusBadge record={record} />
            {hasBlockingErrors(record.validationErrors) ? <Chip size="small" color="error" label={`Con errores (${errors})`} /> : null}
            {record.metadata.origin === "duplicate" ? <Chip size="small" variant="outlined" label="Duplicado" /> : null}
            {customized ? <Chip size="small" variant="outlined" label="Personalizada" /> : null}
          </div>
        </div>
      </CardActionArea>
      <div className={styles.corner}>
        {leading}
        <IconButton size="small" aria-label={`Más acciones de ${title}`} aria-haspopup="menu" aria-controls={anchor ? menuId : undefined} onClick={(e) => setAnchor(e.currentTarget)} className={styles.more}>
          <EllipsisVertical size={18} />
        </IconButton>
      </div>
      <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={run(onEdit)} disabled={readOnly}>
          <ListItemIcon>
            <Pencil size={18} />
          </ListItemIcon>
          Editar
        </MenuItem>
        <MenuItem onClick={run(onDuplicate)} disabled={readOnly}>
          <ListItemIcon>
            <Copy size={18} />
          </ListItemIcon>
          Duplicar
        </MenuItem>
        <MenuItem onClick={run(onMove)} disabled={readOnly}>
          <ListItemIcon>
            <FolderInput size={18} />
          </ListItemIcon>
          Mover a…
        </MenuItem>
        <MenuItem onClick={run(onDownloadSvg)}>
          <ListItemIcon>
            <Download size={18} />
          </ListItemIcon>
          Descargar SVG
        </MenuItem>
        <MenuItem onClick={run(onDelete)} disabled={readOnly}>
          <ListItemIcon>
            <Trash2 size={18} className={styles.danger} />
          </ListItemIcon>
          Eliminar
        </MenuItem>
      </Menu>
    </Card>
  );
});
