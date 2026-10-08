"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar, { type SnackbarCloseReason } from "@mui/material/Snackbar";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NotificationSeverity = "success" | "info" | "warning" | "error";

/**
 * Una notificación nueva reemplaza a la visible si es del mismo grupo o si la visible
 * es pasajera (éxito/info); si no, espera en cola. También sustituye a la en cola
 * del mismo grupo, para que secuencias como "PDF generado → Descarga iniciada →
 * PDF descargado" no se acumulen.
 */
export type NotificationGroup = "export" | "qr-batch" | "import" | "persistence" | "records";

export interface NotifyOptions {
  message: string;
  severity?: NotificationSeverity;
  group?: NotificationGroup;
  action?: { label: string; onClick: () => void };
}

interface Notification extends Required<Pick<NotifyOptions, "message" | "severity">> {
  key: number;
  group: NotificationGroup | undefined;
  action: NotifyOptions["action"];
}

/** Los errores quedan visibles hasta que el usuario los cierra. */
const AUTO_HIDE_MS: Record<NotificationSeverity, number | null> = {
  info: 3000,
  success: 4000,
  warning: 6000,
  error: null,
};

type Notify = (options: NotifyOptions) => void;

const NotifyContext = createContext<Notify | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Notification | null>(null);
  const [open, setOpen] = useState(false);
  const currentRef = useRef<Notification | null>(null);
  const queue = useRef<Notification[]>([]);
  const nextKey = useRef(0);

  const show = useCallback((item: Notification | null) => {
    currentRef.current = item;
    setCurrent(item);
    if (item) setOpen(true);
  }, []);

  const notify = useCallback<Notify>(
    (options) => {
      const item: Notification = {
        key: nextKey.current++,
        message: options.message,
        severity: options.severity ?? "info",
        group: options.group,
        action: options.action,
      };
      if (item.group) queue.current = queue.current.filter((q) => q.group !== item.group);
      const visible = currentRef.current;
      // Un aviso nuevo toma el sitio de uno pasajero (éxito/info): así «2 QR generados» no retiene 4 s a un error que sí importa.
      const transient = visible?.severity === "info" || visible?.severity === "success";
      if (!visible || transient || (item.group !== undefined && visible.group === item.group)) show(item);
      else queue.current.push(item);
    },
    [show],
  );

  const handleClose = (_event: unknown, reason?: SnackbarCloseReason) => {
    if (reason === "clickaway") return;
    setOpen(false);
  };

  const handleExited = () => show(queue.current.shift() ?? null);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={open && current !== null}
        autoHideDuration={current ? AUTO_HIDE_MS[current.severity] : null}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ transition: { onExited: handleExited } }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => setOpen(false)}
            action={
              current.action ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    current.action?.onClick();
                    setOpen(false);
                  }}
                >
                  {current.action.label}
                </Button>
              ) : undefined
            }
            className="w-full"
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): Notify {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error("useNotify debe usarse dentro de <NotificationsProvider>");
  return notify;
}
