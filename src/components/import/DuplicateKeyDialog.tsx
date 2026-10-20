"use client";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import { useId, useState } from "react";

import { FIELD_LABELS } from "@/lib/validation/messages.es";
import { BINDABLE_FIELDS } from "@/schemas/record";
import type { BindableField, DuplicateKeyConfig } from "@/types";

import { ModalLayout } from "@/components/ui/ModalLayout";

export interface DuplicateKeyDialogProps {
  open: boolean;
  value: DuplicateKeyConfig;
  onClose(): void;
  onSave(config: DuplicateKeyConfig): void;
}

/** DuplicateKeySettings (§S1.8): qué campos definen que dos piezas son «la misma». */
export function DuplicateKeyDialog({ open, value, onClose, onSave }: DuplicateKeyDialogProps) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={`${id}-title`} fullWidth maxWidth="xs">
      {open ? <Body id={id} value={value} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  );
}

function Body({ id, value, onClose, onSave }: Pick<DuplicateKeyDialogProps, "value" | "onClose" | "onSave"> & { id: string }) {
  const [fields, setFields] = useState<BindableField[]>([...value.fields]);
  const [caseInsensitive, setCaseInsensitive] = useState(value.caseInsensitive);
  const [canonicalUrl, setCanonicalUrl] = useState(value.canonicalUrl);
  const toggle = (field: BindableField) =>
    setFields((current) => (current.includes(field) ? current.filter((f) => f !== field) : BINDABLE_FIELDS.filter((f) => f === field || current.includes(f))));

  const activeSummary = fields.map((f) => FIELD_LABELS[f]).join(" + ") || "Selecciona al menos un campo";

  return (
    <>
      <ModalLayout.Header id={`${id}-title`} onClose={onClose}>
        Clave de duplicados
      </ModalLayout.Header>
      <ModalLayout.Body>
        <p className="m-0 text-sm text-muted">Dos piezas son duplicadas si coinciden en todos los campos marcados.</p>

        <ModalLayout.Callout className="flex items-center justify-between gap-2 !px-3 !py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted">Combinación activa</span>
            <strong className="truncate text-xs text-foreground">{activeSummary}</strong>
          </div>
          <Button
            size="small"
            variant="text"
            startIcon={<RestartAltIcon fontSize="small" />}
            onClick={() => {
              setFields(["area", "mesa"]);
              setCaseInsensitive(true);
              setCanonicalUrl(true);
            }}
          >
            Por defecto
          </Button>
        </ModalLayout.Callout>

        <FormGroup aria-labelledby={`${id}-title`} className="gap-1">
          <span className="mb-1 text-xs font-semibold text-muted">Campos que identifican la pieza</span>
          <div className="grid grid-cols-2 gap-x-2">
            {BINDABLE_FIELDS.map((field) => (
              <FormControlLabel
                key={field}
                control={<Checkbox size="small" checked={fields.includes(field)} onChange={() => toggle(field)} />}
                label={<span className="text-sm">{FIELD_LABELS[field]}</span>}
              />
            ))}
          </div>

          <span className="mb-1 mt-3 border-t border-divider pt-3 text-xs font-semibold text-muted">Reglas de comparación</span>
          <FormControlLabel
            control={<Checkbox size="small" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />}
            label={<span className="text-sm">No distinguir mayúsculas</span>}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.checked)} />}
            label={<span className="text-sm">Comparar el Link del menú sin #fragmento</span>}
          />
        </FormGroup>
      </ModalLayout.Body>
      <ModalLayout.Footer
        leading={
          <Button onClick={onClose} color="inherit">
            Cancelar
          </Button>
        }
      >
        <Button
          variant="contained"
          disabled={fields.length === 0}
          onClick={() => {
            onSave({ fields, caseInsensitive, canonicalUrl });
            onClose();
          }}
        >
          Aplicar
        </Button>
      </ModalLayout.Footer>
    </>
  );
}
