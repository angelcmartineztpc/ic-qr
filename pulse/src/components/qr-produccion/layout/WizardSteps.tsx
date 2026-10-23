import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { isGenerating } from "@/services/qr-produccion/state/stores";

import { STEPS, type StepIndex } from "./steps";
import styles from "./WizardSteps.module.css";

/**
 * Stepper del flujo (Piezas → Estilo del QR → Diseño → Exportar). Cada paso es un enlace: se puede
 * volver atrás en cualquier momento; los pasos 2 a 4 esperan a que haya piezas.
 * En pantallas pequeñas se resume en «Paso N de 4» con una marca por paso.
 */
export function WizardSteps({ active }: { active: StepIndex }) {
  const count = useProject(useShallow((p) => p.order.length));
  const busy = useSession((s) => isGenerating(s.generation));
  const locked = (index: number) => index > 0 && (count === 0 || busy);

  return (
    <nav aria-label="Pasos" data-testid="wizard-steps">
      <ol className={styles.list}>
        {STEPS.map((step, index) => {
          const done = index < active;
          const current = index === active;
          const disabled = locked(index);
          const body = (
            <>
              <span aria-hidden className={`${styles.dot} ${current ? styles.dotCurrent : done ? styles.dotDone : ""}`}>
                {done ? <Check size={16} /> : index + 1}
              </span>
              <span className={styles.labels}>
                <span className={current ? styles.labelCurrent : styles.label}>{step.label}</span>
                <span className={styles.hint}>{step.hint}</span>
              </span>
            </>
          );
          return (
            <li key={step.id} className={styles.item}>
              {disabled ? (
                <span aria-disabled="true" className={`${styles.link} ${styles.disabled}`}>
                  {body}
                  <span className={styles.srOnly}>{busy ? "No disponible mientras se generan los QR" : "Disponible cuando haya piezas"}</span>
                </span>
              ) : (
                <Link to={step.href} aria-current={current ? "step" : undefined} className={styles.link}>
                  {body}
                </Link>
              )}
              {index < STEPS.length - 1 ? <span aria-hidden className={`${styles.line} ${done ? styles.lineDone : ""}`} /> : null}
            </li>
          );
        })}
      </ol>

      <div className={styles.compact}>
        <span className={styles.compactText}>
          Paso {active + 1} de {STEPS.length} · {STEPS[active]?.label}
        </span>
        <ol className={styles.marks} aria-hidden>
          {STEPS.map((step, index) => (
            <li key={step.id} className={`${styles.mark} ${index <= active ? styles.markOn : ""}`} />
          ))}
        </ol>
      </div>
    </nav>
  );
}
