"use client";

import TextField from "@mui/material/TextField";
import { useState } from "react";

import { defaultFileName, sanitizeFileName } from "@/lib/export/file-name";

/** Nombre del archivo. Vacío = el nombre con fecha y hora locales que se calcula al descargar. */
export function FileNameInput({ value, disabled, onChange }: { value: string; disabled: boolean; onChange(name: string): void }) {
  // La hora del placeholder se fija al montar (renderizar con `new Date()` cambiaría en cada render).
  const [placeholder] = useState(() => defaultFileName(new Date()));
  const effective = sanitizeFileName(value) || placeholder;
  return (
    <TextField
      size="small"
      label="Nombre del archivo"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      helperText={`Se descargará como ${effective}.pdf`}
      slotProps={{ htmlInput: { maxLength: 120, autoComplete: "off" } }}
    />
  );
}
