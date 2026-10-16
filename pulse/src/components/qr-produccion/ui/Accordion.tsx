import { ChevronDown } from "lucide-react";
import { createContext, useContext, useId, useState, type HTMLAttributes, type ReactNode } from "react";

import styles from "./Accordion.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

interface Ctx { open: boolean; toggle: (e: React.SyntheticEvent) => void; id: string; headingTag: "h2" | "h3" | "h4" | "div" }
const AccCtx = createContext<Ctx | null>(null);

export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  defaultExpanded?: boolean;
  expanded?: boolean;
  onChange?: (event: React.SyntheticEvent, expanded: boolean) => void;
  disableGutters?: boolean;
  variant?: "elevation" | "outlined";
  /** `slotProps.heading.component`: etiqueta del encabezado (por defecto h3). */
  slotProps?: { heading?: { component?: "h2" | "h3" | "h4" | "div" } };
  sx?: Sx;
}

export function Accordion({ defaultExpanded = false, expanded, onChange, disableGutters, variant = "elevation", slotProps, className, style, sx, ...rest }: AccordionProps) {
  const [inner, setInner] = useState(defaultExpanded);
  const open = expanded ?? inner;
  const id = useId();
  const toggle = (e: React.SyntheticEvent) => {
    if (expanded === undefined) setInner(!open);
    onChange?.(e, !open);
  };
  return (
    <AccCtx.Provider value={{ open, toggle, id, headingTag: slotProps?.heading?.component ?? "h3" }}>
      <div className={cx(styles.acc, variant === "outlined" && styles.outlined, disableGutters && styles.tight, open && styles.open, className)} style={mergeStyle(style, sx)} {...rest} />
    </AccCtx.Provider>
  );
}

export function AccordionSummary({ expandIcon, children, className }: { expandIcon?: ReactNode; children?: ReactNode; className?: string }) {
  const c = useContext(AccCtx);
  if (!c) return null;
  const H = c.headingTag;
  return (
    <H className={styles.heading}>
      <button type="button" id={`${c.id}-h`} aria-expanded={c.open} aria-controls={`${c.id}-p`} className={cx(styles.summary, className)} onClick={c.toggle}>
        <span className={styles.summaryText}>{children}</span>
        <span className={cx(styles.chevron, c.open && styles.flip)} aria-hidden>{expandIcon ?? <ChevronDown size={20} />}</span>
      </button>
    </H>
  );
}

export function AccordionDetails({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const c = useContext(AccCtx);
  return <div id={c ? `${c.id}-p` : undefined} role="region" aria-labelledby={c ? `${c.id}-h` : undefined} hidden={c ? !c.open : false} className={cx(styles.details, className)} {...rest} />;
}
