import { useId } from "react";

import { FormControl, InputLabel, MenuItem, Select } from "@/components/qr-produccion/ui";

import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { listTemplates } from "@/services/qr-produccion/templates";

import styles from "./TemplatePicker.module.css";
import type { BuilderActions } from "@/components/qr-produccion/records/builder-actions";

/** Selector de plantilla (Piezas y Diseño). Cambiarla con posiciones personalizadas pide confirmación. */
export function TemplatePicker({ actions }: { actions: BuilderActions }) {
  const id = useId();
  const templateId = useProject((p) => p.templateId);
  const readOnly = useSession((s) => s.writer === "read-only");
  return (
    <FormControl size="small" className={styles.picker} disabled={readOnly}>
      <InputLabel id={`${id}-label`}>Plantilla</InputLabel>
      <Select labelId={`${id}-label`} label="Plantilla" value={templateId} onChange={(e) => void actions.switchTemplate(e.target.value)}>
        {listTemplates().map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.name} · {t.tile.width} × {t.tile.height} mm
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
