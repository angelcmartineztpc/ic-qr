import type { ReactNode } from "react";

import styles from "./StepHeader.module.css";
import { STEPS, type StepIndex } from "./steps";

/** Cabecera de cada pantalla: «Paso N de 4», un título y una sola línea que explica qué se hace aquí. */
export function StepHeader({ step, title, description, actions }: { step?: StepIndex; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {step !== undefined ? (
          <p className={styles.step}>
            Paso {step + 1} de {STEPS.length}
          </p>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
