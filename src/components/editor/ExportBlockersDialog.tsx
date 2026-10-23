"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import { useId } from "react";

import { useProject, useSession } from "@/lib/state/StoreProvider";

import { ModalLayout } from "@/components/ui/ModalLayout";

import type { ExportActions } from "./export-actions";

/** Las piezas que impiden exportar, con su motivo y las dos salidas del §1.2-22: corregir o excluir. */
export function ExportBlockersDialog({ actions }: { actions: ExportActions }) {
  const id = useId();
  const review = useSession((s) => s.exportReview);
  const records = useProject((p) => p.recordsById);
  const blocked = review?.blocked ?? [];
  return (
    <Dialog open={blocked.length > 0} onClose={() => actions.dismissReview()} fullWidth maxWidth="sm" aria-labelledby={`${id}-title`}>
      <ModalLayout.Header
        id={`${id}-title`}
        icon={<WarningAmberIcon fontSize="small" />}
        tone="error"
      >
        {blocked.length === 1
          ? "Hay 1 pieza con errores; corrígela antes de generar el PDF"
          : `Hay ${blocked.length} piezas con errores; corrígelas antes de generar el PDF`}
      </ModalLayout.Header>
      <ModalLayout.Body className="flex flex-col gap-3">
        <p className="m-0 text-sm text-muted">
          Corrígelas o déjalas fuera de esta exportación; el resto se genera con la numeración 1…n sobre lo exportado.
        </p>
        <ul className="m-0 flex max-h-72 list-none flex-col gap-2 overflow-auto p-0" data-testid="blockers-list">
          {blocked.map((item) => {
            const record = records[item.recordId];
            return (
              <li key={item.recordId} className="flex flex-col gap-0.5 rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-sm">
                <strong className="text-foreground">
                  {record ? [record.mesa, record.area].filter(Boolean).join(" · ") || "Pieza sin nombre" : item.recordId}
                </strong>
                <span className="text-xs text-muted">{item.reason}</span>
              </li>
            );
          })}
        </ul>
      </ModalLayout.Body>
      <ModalLayout.Footer
        leading={
          <Button onClick={() => actions.dismissReview()} color="inherit">
            Cerrar
          </Button>
        }
      >
        <Button variant="outlined" color="warning" onClick={() => void actions.excludeBlocked()} data-testid="exclude-blocked">
          Excluir {blocked.length} {blocked.length === 1 ? "pieza" : "piezas"} de esta exportación
        </Button>
        <Button variant="contained" onClick={() => actions.fixBlocked()} data-testid="fix-blocked">
          Ir a corregir
        </Button>
      </ModalLayout.Footer>
    </Dialog>
  );
}
