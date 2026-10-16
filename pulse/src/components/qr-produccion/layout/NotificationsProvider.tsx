import { createContext, useCallback, useContext, type ReactNode } from "react";
import { toast } from "sonner";

export type NotificationSeverity = "success" | "info" | "warning" | "error";

/** Una notificación nueva del mismo grupo reemplaza a la anterior (mismo id de toast). */
export type NotificationGroup = "export" | "qr-batch" | "import" | "persistence" | "records";

export interface NotifyOptions {
  message: string;
  severity?: NotificationSeverity;
  group?: NotificationGroup;
  action?: { label: string; onClick: () => void };
}

/** Los errores quedan visibles hasta que el usuario los cierra. */
const DURATION_MS: Record<NotificationSeverity, number> = {
  info: 3000,
  success: 4000,
  warning: 6000,
  error: Infinity,
};

type Notify = (options: NotifyOptions) => void;

const NotifyContext = createContext<Notify | null>(null);

/** Envía a sonner; el `<Toaster />` lo monta la aplicación (App.tsx). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const notify = useCallback<Notify>((options) => {
    const severity = options.severity ?? "info";
    toast[severity](options.message, {
      id: options.group,
      duration: DURATION_MS[severity],
      closeButton: severity === "error",
      action: options.action ? { label: options.action.label, onClick: options.action.onClick } : undefined,
    });
  }, []);
  return <NotifyContext.Provider value={notify}>{children}</NotifyContext.Provider>;
}

export function useNotify(): Notify {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error("useNotify debe usarse dentro de <NotificationsProvider>");
  return notify;
}
