import { QrCode } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/qr-produccion/ui";
import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";

import styles from "./AppShell.module.css";
import type { StepIndex } from "./steps";
import { WizardSteps } from "./WizardSteps";

/** Proyecto abierto y estado de guardado, siempre visibles arriba a la derecha. */
function ProjectBadge() {
  const name = useProject((p) => p.name);
  const count = useProject((p) => p.order.length);
  const status = useSession((s) => s.persistence.status);
  if (count === 0 && name === "") return null;
  return (
    <p className={styles.badge} data-testid="project-badge">
      <span className={styles.badgeName}>{name || "Proyecto sin nombre"}</span>
      <span className={styles.badgeCount}>
        · {count} {count === 1 ? "pieza" : "piezas"}
      </span>
      <span className={styles.badgeStatus}>{status === "saving" ? "Guardando…" : status === "ok" ? "Guardado" : ""}</span>
    </p>
  );
}

/**
 * Marco de todas las pantallas: logotipo (vuelve al Inicio), proyecto abierto y, en los
 * pasos del flujo, el Stepper. Sin menú duplicado: el Stepper es la navegación.
 */
export function AppShell({ children, step }: { children: ReactNode; step?: StepIndex }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#contenido">
        Saltar al contenido
      </a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link to="/qr-produccion" className={styles.logo} aria-label="QR Production Generator: inicio">
            <QrCode size={24} className={styles.logoIcon} aria-hidden />
            <span className={styles.logoText}>QR Production Generator</span>
          </Link>
          <ProjectBadge />
        </div>
        {step !== undefined ? (
          <div className={styles.steps}>
            <WizardSteps active={step} />
          </div>
        ) : null}
      </header>
      <main id="contenido" className={styles.main}>
        {children}
      </main>
    </div>
  );
}

/** Botón de navegación interna. */
export function NavButton({ href, children, variant = "contained" }: { href: string; children: ReactNode; variant?: "contained" | "outlined" | "text" }) {
  return (
    <Button to={href} variant={variant}>
      {children}
    </Button>
  );
}
