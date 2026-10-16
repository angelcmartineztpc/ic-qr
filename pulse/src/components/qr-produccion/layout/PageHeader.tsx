import type { ReactNode } from "react";

import styles from "./StepHeader.module.css";

/** Cabecera estándar de pantalla: un único h1 con la misma jerarquía en todas las rutas. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
