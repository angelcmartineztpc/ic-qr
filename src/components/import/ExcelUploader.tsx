"use client";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import { useId, useRef, useState, type DragEvent } from "react";

export interface ExcelUploaderProps {
  disabled?: boolean;
  onFile(file: File): void;
}

/** Arrastrar y soltar o elegir un .xlsx (en móvil abre el selector de archivos). */
export function ExcelUploader({ disabled, onFile }: ExcelUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      data-testid="excel-dropzone"
      className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-divider"}`}
    >
      <UploadFileIcon color="primary" sx={{ fontSize: 48 }} aria-hidden />
      <p className="m-0 text-lg">Arrastra aquí tu archivo .xlsx</p>
      <p id={hintId} className="m-0 text-sm text-muted">
        o elígelo desde tu equipo. Máximo 10 MB y 5000 filas. Columnas: Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú y Link del QR.
      </p>
      <Button variant="contained" onClick={() => input.current?.click()} disabled={disabled} aria-describedby={hintId}>
        Seleccionar archivo
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        data-testid="excel-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
