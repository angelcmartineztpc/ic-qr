"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

import { FIELD_LABELS } from "@/lib/validation/messages.es";
import { FIELD_KEYS, REQUIRED_FIELDS } from "@/schemas/record";
import type { ColumnMapping, FieldKey } from "@/types";

const NONE = "";
const isRequired = (field: FieldKey) => (REQUIRED_FIELDS as readonly string[]).includes(field);

export interface ColumnMappingDialogProps {
  open: boolean;
  mapping: readonly ColumnMapping[];
  onClose(): void;
  onApply(columns: Record<string, FieldKey | null>): void;
}

/** «Columna para Mesa: [Select]»: la persona asigna a mano lo que no se pudo reconocer. */
export function ColumnMappingDialog({ open, mapping, onClose, onApply }: ColumnMappingDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      {open ? <Body mapping={mapping} onClose={onClose} onApply={onApply} /> : null}
    </Dialog>
  );
}

function Body({ mapping, onClose, onApply }: Omit<ColumnMappingDialogProps, "open">) {
  const id = useId();
  const [choice, setChoice] = useState<Record<string, FieldKey | null>>(() => Object.fromEntries(mapping.map((m) => [m.column, m.field])));
  const used = new Set(Object.values(choice).filter((f): f is FieldKey => f !== null));
  const missing = REQUIRED_FIELDS.filter((field) => !used.has(field));

  return (
    <>
      <DialogTitle id={`${id}-title`}>Confirma las columnas</DialogTitle>
      <DialogContent dividers>
        <p className="mt-0 text-sm text-muted">No pudimos reconocer todas las columnas. Elige a qué campo corresponde cada una; las obligatorias son Área, Mesa y Link del menú.</p>
        <div className="grid gap-4" role="group" aria-labelledby={`${id}-title`}>
          {mapping.map((m) => {
            const detected = m.match === "ambiguous" ? "Ambigua" : m.match === "fuzzy" ? "Aproximada" : null;
            return (
              <TextField
                key={m.column}
                select
                size="small"
                label={`Columna ${m.column}: «${m.header}»`}
                value={choice[m.column] ?? NONE}
                onChange={(e) => setChoice((c) => ({ ...c, [m.column]: e.target.value === NONE ? null : (e.target.value as FieldKey) }))}
                helperText={detected ? `${detected}${m.candidates?.length ? ` · podría ser ${m.candidates.map((c) => FIELD_LABELS[c]).join(" o ")}` : ""}` : undefined}
              >
                <MenuItem value={NONE}>No importar (se conserva como dato extra)</MenuItem>
                {FIELD_KEYS.map((field) => (
                  <MenuItem key={field} value={field} disabled={used.has(field) && choice[m.column] !== field}>
                    {FIELD_LABELS[field]}
                    {isRequired(field) ? " (obligatorio)" : ""}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
        </div>
        {missing.length > 0 ? (
          <p role="alert" className="mb-0 mt-4 text-sm text-error">
            Falta asignar: {missing.map((f) => FIELD_LABELS[f]).join(", ")}.
          </p>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={missing.length > 0} onClick={() => onApply(choice)}>
          Aplicar y revisar
        </Button>
      </DialogActions>
    </>
  );
}
