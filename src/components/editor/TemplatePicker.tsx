"use client";

import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { useId } from "react";

import { useProject, useSession } from "@/lib/state/StoreProvider";
import { listTemplates } from "@/templates";

import type { BuilderActions } from "@/components/records/builder-actions";

/** Selector de plantilla (Dashboard y /preview). Cambiarla con posiciones personalizadas pide confirmación. */
export function TemplatePicker({ actions }: { actions: BuilderActions }) {
  const id = useId();
  const templateId = useProject((p) => p.templateId);
  const readOnly = useSession((s) => s.writer === "read-only");
  return (
    <FormControl size="small" className="min-w-56" disabled={readOnly}>
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
