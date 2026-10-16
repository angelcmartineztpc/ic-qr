import { Pencil } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, TextField } from "@/components/qr-produccion/ui";
import { getLinkInfo, updateLinkDestination } from "@/services/qr-produccion/app/links-client";
import type { LinkInfo } from "@/services/qr-produccion/schemas/links";

import styles from "./LinkDestination.module.css";

/**
 * A dónde lleva el link corto de una pieza, y cómo cambiarlo sin reimprimir.
 * El QR codifica solo el link corto: cambiar el destino no cambia el QR ni lo desactualiza.
 */
export function LinkDestination({ code, readOnly }: { code: string; readOnly: boolean }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getLinkInfo(code, controller.signal).then(
      (next) => {
        setInfo(next);
        setError(null);
      },
      (e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setError(e instanceof Error ? e.message : "No se pudo consultar el destino");
      },
    );
    return () => controller.abort();
  }, [code]);

  return (
    <div className={styles.root} data-testid="link-destination">
      <div className={styles.row}>
        <div className={styles.text}>
          <p className={styles.label}>Destino del link corto</p>
          {info ? (
            <p className={styles.destination}>
              <Link href={info.destination} target="_blank" rel="noopener noreferrer" underline="hover">
                {info.destination}
              </Link>
            </p>
          ) : error ? (
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          ) : (
            <p className={styles.label} role="status">
              Consultando…
            </p>
          )}
        </div>
        {info && !readOnly ? (
          <Button size="small" variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditing(true)}>
            Cambiar destino
          </Button>
        ) : null}
      </div>
      {info && info.history.length > 0 ? <p className={styles.history}>Se ha cambiado {info.history.length === 1 ? "1 vez" : `${info.history.length} veces`}; el QR sigue siendo el mismo.</p> : null}
      {editing && info ? <DestinationDialog info={info} onClose={() => setEditing(false)} onSaved={setInfo} /> : null}
    </div>
  );
}

function DestinationDialog({ info, onClose, onSaved }: { info: LinkInfo; onClose(): void; onSaved(next: LinkInfo): void }) {
  const id = useId();
  const notify = useNotify();
  const [value, setValue] = useState(info.destination);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = value.trim() === info.destination;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateLinkDestination(info.code, value.trim(), info.revision);
      onSaved(next);
      notify({ message: "Destino actualizado: las placas ya impresas llevarán a la nueva dirección", severity: "success", group: "records" });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el destino");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby={`${id}-title`}>
      <form onSubmit={submit} noValidate>
        <DialogTitle id={`${id}-title`}>Cambiar el destino</DialogTitle>
        <DialogContent className={styles.dialogContent}>
          <p className={styles.label}>
            El QR de esta pieza codifica <strong>{info.shortUrl}</strong> y no cambia. Al guardar, ese link llevará a la dirección nueva, incluso en las placas ya impresas.
          </p>
          <TextField autoFocus label="Destino nuevo" type="url" value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: "url", autoComplete: "off", spellCheck: false } }} />
          {error ? (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={busy || unchanged}>
            Guardar destino
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
