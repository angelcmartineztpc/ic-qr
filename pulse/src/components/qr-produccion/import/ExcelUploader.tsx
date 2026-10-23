import { FileUp } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/qr-produccion/ui";

import styles from "./ExcelUploader.module.css";

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
      className={`${styles.zone} ${over ? styles.over : ""}`.trim()}
    >
      <FileUp size={48} className={styles.icon} aria-hidden />
      <p className={styles.title}>Arrastra aquí tu archivo .xlsx o .csv</p>
      <div id={hintId} className={styles.hint}>
        <p className={styles.line}>o elígelo desde tu equipo.</p>
        <ul className={styles.rules}>
          <li>
            <strong className={styles.strong}>Columnas obligatorias:</strong> Área, Mesa y Link del menú.
          </li>
          <li>
            <strong className={styles.strong}>Opcionales:</strong> Estación, Sub-grupo, Concepto y Link del QR.
          </li>
          <li>
            <strong className={styles.strong}>Límite:</strong> 10 MB y 5000 filas. Un .csv puede separar con coma, punto y coma o tabulador.
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
