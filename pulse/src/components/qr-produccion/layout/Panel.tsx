import type { ReactNode } from "react";

import styles from "./Panel.module.css";

/** Bloque con borde y respiración uniforme: así todas las pantallas separan y agrupan igual. */
export function Panel({ title, description, actions, children, className = "", label }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label ?? title} className={`${styles.panel} ${className}`.trim()}>
      {title || actions ? (
        <div className={styles.head}>
          <div className={styles.titles}>
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
