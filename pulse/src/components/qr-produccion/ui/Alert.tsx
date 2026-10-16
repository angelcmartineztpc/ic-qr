import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Alert.module.css";
import { IconButton } from "./Button";
import { cx, mergeStyle, type Sx } from "./utils";

type Severity = "info" | "warning" | "error" | "success";
const ICONS: Record<Severity, ReactNode> = {
  info: <Info size={20} />,
  warning: <AlertTriangle size={20} />,
  error: <XCircle size={20} />,
  success: <CheckCircle2 size={20} />,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  severity?: Severity;
  variant?: "standard" | "outlined";
  title?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  icon?: ReactNode | false;
  sx?: Sx;
}

export function Alert({ severity = "info", variant = "standard", title, action, onClose, icon, children, className, role, style, sx, ...rest }: AlertProps) {
  return (
    <div role={role ?? (severity === "error" || severity === "warning" ? "alert" : "status")} className={cx(styles.alert, styles[severity], variant === "outlined" && styles.outlined, className)} style={mergeStyle(style, sx)} {...rest}>
      {icon === false ? null : <span className={styles.icon} aria-hidden>{icon ?? ICONS[severity]}</span>}
      <div className={styles.body}>
        {title ? <div className={styles.title}>{title}</div> : null}
        {children}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
      {onClose ? <IconButton size="small" aria-label="Cerrar" onClick={onClose} className={styles.close}><X size={18} /></IconButton> : null}
    </div>
  );
}
