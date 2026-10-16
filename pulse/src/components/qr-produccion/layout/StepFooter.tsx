import { ArrowLeft, ArrowRight } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/qr-produccion/ui";

import styles from "./StepFooter.module.css";

export interface StepFooterProps {
  back?: { href: string; label: string };
  next?: { href: string; label: string; disabled?: boolean };
  /** Acción principal propia (p. ej. «Descargar PDF»); sustituye al botón «Siguiente». */
  primary?: ReactNode;
  /** Por qué no se puede avanzar (se muestra junto al botón). */
  note?: string;
}

/** Barra inferior fija con la navegación del paso: Atrás a la izquierda, lo siguiente a la derecha. */
export function StepFooter({ back, next, primary, note }: StepFooterProps) {
  const noteId = useId();
  return (
    <div className={styles.footer} data-testid="step-footer">
      <div className={styles.inner}>
        {back ? (
          <Button to={back.href} startIcon={<ArrowLeft size={18} />} color="inherit">
            {back.label}
          </Button>
        ) : (
          <span />
        )}
        <div className={styles.right}>
          {note ? (
            <span id={noteId} className={styles.note}>
              {note}
            </span>
          ) : null}
          {primary ??
            (next ? (
              next.disabled ? (
                <Button variant="contained" endIcon={<ArrowRight size={18} />} disabled {...(note ? { "aria-describedby": noteId } : {})}>
                  {next.label}
                </Button>
              ) : (
                <Button to={next.href} variant="contained" endIcon={<ArrowRight size={18} />} data-testid="step-next">
                  {next.label}
                </Button>
              )
            ) : null)}
        </div>
      </div>
    </div>
  );
}
