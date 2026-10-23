"use client";

import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContentText from "@mui/material/DialogContentText";
import { useId } from "react";

import { ModalLayout } from "@/components/ui/ModalLayout";

export interface StartOverDialogProps {
  open: boolean;
  projectName: string;
  pieceCount: number;
  onClose(): void;
  onSaveBackup(): void;
  onConfirm(): void;
}

/**
 * Modal de confirmación para «Empezar de nuevo / Nuevo proyecto».
 * Sigue el estándar Material 3 Expressive (`rounded-t-[28px] rounded-b-xl`),
 * informa qué ocurre con el proyecto actual en el navegador y ofrece guardar respaldo `.qrproj` antes de limpiar.
 */
export function StartOverDialog({
  open,
  projectName,
  pieceCount,
  onClose,
  onSaveBackup,
  onConfirm,
}: StartOverDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const displayTitle = projectName.trim() ? `«${projectName.trim()}»` : "actual";
  const countLabel = `${pieceCount} ${pieceCount === 1 ? "pieza" : "piezas"}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      slotProps={{
        paper: {
          className: "!rounded-t-2xl !rounded-b-xl !border !border-divider !bg-surface !bg-none",
        },
      }}
    >
      <ModalLayout.Header
        id={titleId}
        icon={<NoteAddOutlinedIcon fontSize="small" />}
        tone="primary"
        onClose={onClose}
      >
        ¿Empezar un proyecto desde cero?
      </ModalLayout.Header>

      <ModalLayout.Body dividers={false} className="flex flex-col gap-3.5">
        <DialogContentText id={descriptionId} className="!m-0 !text-sm !leading-relaxed !text-foreground/85">
          El proyecto {displayTitle} ({countLabel}) se borrará de este navegador para iniciar un lote nuevo en blanco.
        </DialogContentText>

        <ModalLayout.Callout className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              ¿Quieres conservar una copia antes de reiniciar?
            </span>
            <span className="text-xs leading-relaxed text-muted">
              El proyecto actual no se guarda como borrador al empezar de cero, pero puedes descargarlo como archivo{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-[11px]">.qrproj.json</code> para volver a abrirlo cuando quieras.
            </span>
          </div>
          <div>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<SaveAltIcon fontSize="small" />}
              onClick={onSaveBackup}
              className="!rounded-full !border-divider !bg-surface !px-3.5 !text-xs"
            >
              Guardar respaldo (.qrproj)
            </Button>
          </div>
        </ModalLayout.Callout>
      </ModalLayout.Body>

      <ModalLayout.Footer
        leading={
          <Button
            onClick={onClose}
            color="inherit"
            variant="outlined"
            className="!rounded-full !border-divider !px-4"
            autoFocus
          >
            Cancelar
          </Button>
        }
      >
        <Button
          onClick={onConfirm}
          variant="contained"
          color="primary"
          className="!rounded-full !px-5"
        >
          Sí, empezar de nuevo
        </Button>
      </ModalLayout.Footer>
    </Dialog>
  );
}

