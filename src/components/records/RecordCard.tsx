"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import { memo, useId, useState, type ReactNode } from "react";

import { hasBlockingErrors } from "@/lib/validation/validate";
import type { QRRecord } from "@/types";

import { TilePreview } from "@/components/preview/TilePreview";

import { QrStatusBadge } from "./QrStatusBadge";

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

/** Tarjeta de una pieza: vista previa, datos clave, estado del QR y acciones directas. */
export const RecordCard = memo(function RecordCard({
  record,
  position,
  selected,
  customized,
  readOnly,
  leading,
  onSelect,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
  onDownloadSvg,
}: RecordCardProps) {
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
    <Card
      variant="outlined"
      className={`group relative flex h-full flex-col overflow-hidden !rounded-t-2xl !rounded-b-xl transition-shadow ${selected ? "ring-2 ring-primary shadow-sm" : "hover:border-primary/40"}`}
      data-testid="record-card"
      data-record-id={record.id}
      aria-current={selected ? "true" : undefined}
    >
      {/* Barra superior de la tarjeta: posición, título y acciones sin tapar el arte de 70×70 mm */}
      <div className="flex items-center justify-between gap-1 border-b border-divider bg-background/60 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full bg-black/6 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">#{position}</span>
          <strong className="truncate text-sm font-semibold text-foreground" title={title}>
            {title}
          </strong>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {leading}
          {!readOnly ? (
            <Tooltip title="Editar pieza (o doble clic)">
              <IconButton
                size="small"
                aria-label={`Editar ${title}`}
                onClick={() => onEdit(record.id)}
                className="opacity-80 hover:opacity-100"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          <IconButton
            size="small"
            aria-label={`Más acciones de ${title}`}
            aria-haspopup="menu"
            aria-controls={anchor ? menuId : undefined}
            onClick={(e) => setAnchor(e.currentTarget)}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      <CardActionArea
        onClick={() => onSelect(record.id)}
        onDoubleClick={() => {
          if (!readOnly) onEdit(record.id);
        }}
        className="flex flex-1 flex-col items-stretch gap-2 p-2.5"
      >
        <div aria-hidden className="rounded-lg bg-background p-1.5">
          <TilePreview record={record} />
        </div>
        <div className="flex flex-col gap-1.5 px-0.5">
          {subtitle ? <span className="truncate text-xs text-muted">{subtitle}</span> : null}
          <div className="flex flex-wrap gap-1">
            <QrStatusBadge record={record} />
            {hasBlockingErrors(record.validationErrors) ? <Chip size="small" color="error" className="!rounded-full" label={`Con errores (${errors})`} /> : null}
            {record.metadata.origin === "duplicate" ? <Chip size="small" variant="outlined" className="!rounded-full" label="Duplicado" /> : null}
            {customized ? <Chip size="small" variant="outlined" className="!rounded-full" label="Personalizada" /> : null}
          </div>
        </div>
      </CardActionArea>

      <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={run(onEdit)} disabled={readOnly}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Editar
        </MenuItem>
        <MenuItem onClick={run(onDuplicate)} disabled={readOnly}>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          Duplicar
        </MenuItem>
        <MenuItem onClick={run(onMove)} disabled={readOnly}>
          <ListItemIcon>
            <DriveFileMoveIcon fontSize="small" />
          </ListItemIcon>
          Mover a…
        </MenuItem>
        <MenuItem onClick={run(onDownloadSvg)}>
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          Descargar SVG
        </MenuItem>
        <MenuItem onClick={run(onDelete)} disabled={readOnly}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          Eliminar
        </MenuItem>
      </Menu>
    </Card>
  );
});
