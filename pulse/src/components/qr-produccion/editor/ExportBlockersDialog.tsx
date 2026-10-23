import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@/components/qr-produccion/ui";
import { useId } from "react";

import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";

import styles from "./ExportBlockersDialog.module.css";
import type { ExportActions } from "./export-actions";

/** Las piezas que impiden exportar, con su motivo y las dos salidas del §1.2-22: corregir o excluir. */
export function ExportBlockersDialog({ actions }: { actions: ExportActions }) {
  const id = useId();
  const review = useSession((s) => s.exportReview);
  const records = useProject((p) => p.recordsById);
  const blocked = review?.blocked ?? [];
  return (
    <Dialog open={blocked.length > 0} onClose={() => actions.dismissReview()} fullWidth maxWidth="sm" aria-labelledby={`${id}-title`}>
      <DialogTitle id={`${id}-title`}>{blocked.length === 1 ? "Hay 1 pieza con errores; corrígela antes de generar el PDF" : `Hay ${blocked.length} piezas con errores; corrígelas antes de generar el PDF`}</DialogTitle>
      <DialogContent dividers>
        <p className={styles.hint}>Corrígelas o déjalas fuera de esta exportación; el resto se genera con la numeración 1…n sobre lo exportado.</p>
        <ul className={styles.list} data-testid="blockers-list">
          {blocked.map((item) => {
            const record = records[item.recordId];
            return (
              <li key={item.recordId} className={styles.item}>
                <strong>{record ? [record.mesa, record.area].filter(Boolean).join(" · ") || "Pieza sin nombre" : item.recordId}</strong>
                <span className={styles.reason}>{item.reason}</span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => actions.dismissReview()}>Cerrar</Button>
        <Button onClick={() => void actions.excludeBlocked()} data-testid="exclude-blocked">
          Excluir {blocked.length} {blocked.length === 1 ? "pieza" : "piezas"} de esta exportación
        </Button>
        <Button variant="contained" onClick={() => actions.fixBlocked()} data-testid="fix-blocked">
          Ir a corregir
        </Button>
      </DialogActions>
    </Dialog>
  );
}
