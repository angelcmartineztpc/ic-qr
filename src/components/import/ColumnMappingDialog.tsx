"use client";

import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EastIcon from "@mui/icons-material/East";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

import { FIELD_LABELS } from "@/lib/validation/messages.es";
import { FIELD_KEYS, REQUIRED_FIELDS } from "@/schemas/record";
import type { ColumnMapping, FieldKey } from "@/types";

import { ModalLayout } from "@/components/ui/ModalLayout";

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
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={`${id}-title`} fullWidth maxWidth="md">
      {open ? <Body id={id} mapping={mapping} onClose={onClose} onApply={onApply} /> : null}
    </Dialog>
  );
}

function Body({ id, mapping, onClose, onApply }: Omit<ColumnMappingDialogProps, "open"> & { id: string }) {
  const [choice, setChoice] = useState<Record<string, FieldKey | null>>(() => Object.fromEntries(mapping.map((m) => [m.column, m.field])));
  const used = new Set(Object.values(choice).filter((f): f is FieldKey => f !== null));
  const missing = REQUIRED_FIELDS.filter((field) => !used.has(field));
  const unmappedColumns = mapping.filter((m) => !choice[m.column]);
  const canAutoPair = missing.length === 1 && unmappedColumns.length === 1 && missing[0] !== undefined && unmappedColumns[0] !== undefined;

  return (
    <>
      <ModalLayout.Header id={`${id}-title`} onClose={onClose}>
        Confirma las columnas de tu archivo
      </ModalLayout.Header>
      <ModalLayout.Body>
        <p className="m-0 text-sm text-muted">
          Revisa cómo conectamos las columnas de tu Excel con los datos de cada pieza. Las columnas marcadas en ámbar necesitan que elijas su campo:
        </p>

        <ModalLayout.Callout className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Datos obligatorios:</span>
            {REQUIRED_FIELDS.map((reqField) => {
              const assigned = used.has(reqField);
              return (
                <Chip
                  key={reqField}
                  size="small"
                  color={assigned ? "success" : "warning"}
                  variant={assigned ? "filled" : "outlined"}
                  icon={assigned ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
                  label={FIELD_LABELS[reqField]}
                />
              );
            })}
          </div>
          {canAutoPair ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon fontSize="small" />}
              onClick={() => {
                const targetCol = unmappedColumns[0];
                const targetField = missing[0];
                if (targetCol && targetField) {
                  setChoice((c) => ({ ...c, [targetCol.column]: targetField }));
                }
              }}
            >
              Asignar «{unmappedColumns[0]?.header}» a {FIELD_LABELS[missing[0]!]}
            </Button>
          ) : null}
        </ModalLayout.Callout>

        <div className="flex flex-col gap-2.5" role="group" aria-labelledby={`${id}-title`}>
          <div className="hidden grid-cols-[1fr_auto_1.15fr] items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted sm:grid">
            <span>Columna en tu Excel</span>
            <span className="w-5" />
            <span>Campo en la pieza</span>
          </div>

          {mapping.map((m) => {
            const selectedField = choice[m.column] ?? null;
            const isAssigned = selectedField !== null;
            const needsAttention = !isAssigned && (missing.length > 0 || m.match === "ambiguous");
            const detected = m.match === "ambiguous" ? "Ambigua" : m.match === "fuzzy" ? "Aproximada" : null;
            const quickSuggestions = !isAssigned
              ? [...new Set([...(m.candidates ?? []), ...missing])].filter((f) => !used.has(f))
              : [];

            return (
              <div
                key={m.column}
                className={`grid grid-cols-1 items-center gap-2.5 rounded-xl border p-3 transition-colors sm:grid-cols-[1fr_auto_1.15fr] sm:gap-3 ${
                  needsAttention
                    ? "border-amber-500/50 bg-amber-500/8"
                    : isAssigned
                      ? "border-emerald-500/25 bg-surface"
                      : "border-divider bg-background/40"
                }`}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex shrink-0 items-center rounded bg-background px-1.5 py-0.5 font-mono text-xs font-semibold text-muted border border-divider">
                      Col {m.column}
                    </span>
                    <strong className="truncate text-sm font-semibold text-foreground" title={m.header}>
                      «{m.header}»
                    </strong>
                    {isAssigned ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircleIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                        {m.field === selectedField && m.match === "exact" ? "Reconocida" : "Asignada"}
                      </span>
                    ) : needsAttention ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <WarningAmberIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                        Por asignar
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Dato extra</span>
                    )}
                  </div>

                  {detected ? (
                    <span className="text-xs text-muted">
                      {detected}
                      {m.candidates?.length ? ` · podría ser ${m.candidates.map((c) => FIELD_LABELS[c]).join(" o ")}` : ""}
                    </span>
                  ) : null}

                  {quickSuggestions.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-muted">Asignar en 1 clic:</span>
                      {quickSuggestions.map((suggestedField) => (
                        <Chip
                          key={suggestedField}
                          size="small"
                          color={isRequired(suggestedField) ? "warning" : "default"}
                          variant="outlined"
                          label={`+ ${FIELD_LABELS[suggestedField]}`}
                          onClick={() => setChoice((c) => ({ ...c, [m.column]: suggestedField }))}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <EastIcon fontSize="small" className="hidden text-muted sm:block" aria-hidden="true" />

                <TextField
                  select
                  size="small"
                  label={`Columna ${m.column}: «${m.header}»`}
                  value={selectedField ?? NONE}
                  onChange={(e) => setChoice((c) => ({ ...c, [m.column]: e.target.value === NONE ? null : (e.target.value as FieldKey) }))}
                >
                  <MenuItem value={NONE}>No importar (se conserva como dato extra)</MenuItem>
                  {FIELD_KEYS.map((field) => (
                    <MenuItem key={field} value={field} disabled={used.has(field) && choice[m.column] !== field}>
                      {FIELD_LABELS[field]}
                      {isRequired(field) ? " (obligatorio)" : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </div>
            );
          })}
        </div>

        {missing.length > 0 ? (
          <Alert severity="error" role="alert" className="py-1">
            Falta asignar: {missing.map((f) => FIELD_LABELS[f]).join(", ")}.
          </Alert>
        ) : null}
      </ModalLayout.Body>
      <ModalLayout.Footer
        leading={
          <Button onClick={onClose} color="inherit">
            Cancelar
          </Button>
        }
      >
        <Button variant="contained" disabled={missing.length > 0} onClick={() => onApply(choice)}>
          Aplicar y revisar
        </Button>
      </ModalLayout.Footer>
    </>
  );
}
