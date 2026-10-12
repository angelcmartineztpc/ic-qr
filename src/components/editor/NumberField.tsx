"use client";

import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

import type { EditResult } from "./editor-actions";

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export interface NumberFieldProps {
  label: string;
  /** Valor en la unidad base (mm, pt…). */
  value: number;
  /** Factor para mostrar: 1 para mm; 0.1 para cm. */
  factor?: number;
  unit: string;
  disabled?: boolean;
  step?: number;
  /** Devuelve ok o el mensaje por el que se rechaza (nunca se corrige en silencio). */
  onCommit(value: number): EditResult;
}

/** Campo numérico que se valida al perder el foco o con Enter; acepta coma decimal. */
export function NumberField({ label, value, factor = 1, unit, disabled, step = 0.1, onCommit }: NumberFieldProps) {
  const id = useId();
  const shown = fmt(value * factor);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.trim().replace(",", "."));
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setError("Escribe un número");
      return;
    }
    const result = onCommit(parsed / factor);
    if (result.ok) {
      setDraft(null);
      setError(null);
    } else setError(result.message);
  };

  return (
    <TextField
      id={id}
      size="small"
      label={label}
      type="number"
      value={draft ?? shown}
      disabled={disabled}
      error={error !== null}
      helperText={error ?? " "}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(null);
          setError(null);
        }
      }}
      slotProps={{ htmlInput: { step: step * factor, inputMode: "decimal" }, input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
    />
  );
}
