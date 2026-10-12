"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

/** «Mover a posición N»: la forma de reordenar con 1000 piezas paginadas, en móvil o sin arrastrar. */
interface Props {
  open: boolean;
  label: string;
  current: number;
  total: number;
  onClose(): void;
  onMove(index: number): void;
}

export function MoveToDialog({ open, ...rest }: Props) {
  const id = useId();
  return (
    <Dialog open={open} onClose={rest.onClose} aria-labelledby={`${id}-title`}>
      <MoveToBody id={id} {...rest} />
    </Dialog>
  );
}

function MoveToBody({ id, label, current, total, onClose, onMove }: Omit<Props, "open"> & { id: string }) {
  const [value, setValue] = useState(String(current));
  const target = Number.parseInt(value, 10);
  const valid = Number.isInteger(target) && target >= 1 && target <= total;
  const go = (position: number) => {
    onMove(position - 1);
    onClose();
  };

  return (
    <>
      <DialogTitle id={`${id}-title`}>Mover «{label}»</DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) go(target);
          }}
        >
          <TextField
            autoFocus
            label={`Nueva posición (1–${total})`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={!valid}
            helperText={valid ? `Ahora está en la posición ${current}` : `Escribe un número entre 1 y ${total}`}
            slotProps={{ htmlInput: { min: 1, max: total, step: 1 } }}
          />
        </form>
        <div className="flex gap-2">
          <Button size="small" onClick={() => go(1)} disabled={current === 1}>
            Al inicio
          </Button>
          <Button size="small" onClick={() => go(total)} disabled={current === total}>
            Al final
          </Button>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!valid || target === current} onClick={() => go(target)}>
          Mover
        </Button>
      </DialogActions>
    </>
  );
}
