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
      <p className="m-0 text-lg">Arrastra aquí tu archivo .xlsx o .csv</p>
      <div id={hintId} className="flex max-w-2xl flex-col gap-1 text-sm text-muted">
        <p className="m-0">o elígelo desde tu equipo.</p>
        <ul className="m-0 list-none p-0">
          <li>
            <strong className="font-semibold text-foreground">Columnas obligatorias:</strong> Área, Mesa y Link del menú.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Opcionales:</strong> Estación, Sub-grupo, Concepto y Link del QR.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Límite:</strong> 10 MB y 5000 filas. Un .csv puede separar con coma, punto y coma o tabulador.
          </li>
        </ul>
      </div>
      <Button variant="contained" onClick={() => input.current?.click()} disabled={disabled} aria-describedby={hintId}>
        Seleccionar archivo
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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
