"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva: el botón de confirmar se pinta como error. */
  destructive?: boolean;
  /** Casilla opcional («No volver a preguntar en esta sesión»). */
  checkboxLabel?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  checked: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
type ConfirmDetailed = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<{ confirm: Confirm; confirmDetailed: ConfirmDetailed } | null>(null);

/**
 * Confirmación basada en promesas: `if (await confirm({...})) …`.
 * Sustituye a window.confirm (prohibido junto con alert por las reglas de calidad).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const resolver = useRef<((value: ConfirmResult) => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirmDetailed = useCallback<ConfirmDetailed>((next) => {
    resolver.current?.({ confirmed: false, checked: false });
    setChecked(false);
    setOptions(next);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const confirm = useCallback<Confirm>(async (next) => (await confirmDetailed(next)).confirmed, [confirmDetailed]);

  const settle = (confirmed: boolean) => {
    resolver.current?.({ confirmed, checked: confirmed && checked });
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, confirmDetailed }}>
      {children}
      <Dialog open={options !== null} onClose={() => settle(false)} aria-labelledby={titleId} aria-describedby={options?.message ? descriptionId : undefined}>
        <DialogTitle id={titleId}>{options?.title}</DialogTitle>
        {options?.message || options?.checkboxLabel ? (
          <DialogContent>
            {options.message ? <DialogContentText id={descriptionId}>{options.message}</DialogContentText> : null}
            {options.checkboxLabel ? <FormControlLabel control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />} label={options.checkboxLabel} /> : null}
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => settle(false)} autoFocus>
            {options?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button onClick={() => settle(true)} variant="contained" color={options?.destructive ? "error" : "primary"}>
            {options?.confirmLabel ?? "Aceptar"}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return context.confirm;
}

export function useConfirmDetailed(): ConfirmDetailed {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirmDetailed debe usarse dentro de <ConfirmProvider>");
  return context.confirmDetailed;
}

/** Texto estándar del spec §38 para salir con cambios sin guardar. */
export const UNSAVED_CHANGES_CONFIRM: ConfirmOptions = {
  title: "Tienes cambios sin guardar.",
  confirmLabel: "Salir sin guardar",
  cancelLabel: "Cancelar",
  destructive: true,
};
