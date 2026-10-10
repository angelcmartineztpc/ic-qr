"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import { useId, useState } from "react";

import { FIELD_LABELS } from "@/lib/validation/messages.es";
import { BINDABLE_FIELDS } from "@/schemas/record";
import type { BindableField, DuplicateKeyConfig } from "@/types";

export interface DuplicateKeyDialogProps {
  open: boolean;
  value: DuplicateKeyConfig;
  onClose(): void;
  onSave(config: DuplicateKeyConfig): void;
}

/** DuplicateKeySettings (§S1.8): qué campos definen que dos piezas son «la misma». */
export function DuplicateKeyDialog({ open, value, onClose, onSave }: DuplicateKeyDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      {open ? <Body value={value} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  );
}

function Body({ value, onClose, onSave }: Pick<DuplicateKeyDialogProps, "value" | "onClose" | "onSave">) {
  const id = useId();
  const [fields, setFields] = useState<BindableField[]>([...value.fields]);
  const [caseInsensitive, setCaseInsensitive] = useState(value.caseInsensitive);
  const [canonicalUrl, setCanonicalUrl] = useState(value.canonicalUrl);
  const toggle = (field: BindableField) => setFields((current) => (current.includes(field) ? current.filter((f) => f !== field) : BINDABLE_FIELDS.filter((f) => f === field || current.includes(f))));

  return (
    <>
      <DialogTitle id={`${id}-title`}>Clave de duplicados</DialogTitle>
      <DialogContent dividers>
        <p className="mt-0 text-sm text-muted">Dos piezas son duplicadas si coinciden en todos los campos marcados.</p>
        <FormGroup aria-labelledby={`${id}-title`}>
          {BINDABLE_FIELDS.map((field) => (
            <FormControlLabel key={field} control={<Checkbox checked={fields.includes(field)} onChange={() => toggle(field)} />} label={FIELD_LABELS[field]} />
          ))}
          <FormControlLabel control={<Checkbox checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />} label="No distinguir mayúsculas" />
          <FormControlLabel control={<Checkbox checked={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.checked)} />} label="Comparar el Link del menú sin #fragmento" />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={fields.length === 0} onClick={() => { onSave({ fields, caseInsensitive, canonicalUrl }); onClose(); }}>
          Aplicar
        </Button>
      </DialogActions>
    </>
  );
}
