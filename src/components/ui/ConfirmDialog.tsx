"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva: el botón de confirmar se pinta como error. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Confirmación basada en promesas: `if (await confirm({...})) …`.
 * Sustituye a window.confirm (prohibido junto con alert por las reglas de calidad).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        aria-labelledby={titleId}
        aria-describedby={options?.message ? descriptionId : undefined}
      >
        <DialogTitle id={titleId}>{options?.title}</DialogTitle>
        {options?.message ? (
          <DialogContent>
            <DialogContentText id={descriptionId}>{options.message}</DialogContentText>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => settle(false)} autoFocus>
            {options?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            onClick={() => settle(true)}
            variant="contained"
            color={options?.destructive ? "error" : "primary"}
          >
            {options?.confirmLabel ?? "Aceptar"}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return confirm;
}

/** Texto estándar del spec §38 para salir con cambios sin guardar. */
export const UNSAVED_CHANGES_CONFIRM: ConfirmOptions = {
  title: "Tienes cambios sin guardar.",
  confirmLabel: "Salir sin guardar",
  cancelLabel: "Cancelar",
  destructive: true,
};
