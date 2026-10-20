"use client";

import EditIcon from "@mui/icons-material/Edit";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import { useEffect, useId, useState, type FormEvent } from "react";

import { getLinkInfo, updateLinkDestination } from "@/lib/app/links-client";
import type { LinkInfo } from "@/schemas/links";

import { ModalLayout } from "@/components/ui/ModalLayout";
import { useNotify } from "@/components/ui/NotificationsProvider";

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
    <div className="flex flex-col gap-1" data-testid="link-destination">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="m-0 text-sm text-muted">Destino del link corto</p>
          {info ? (
            <p className="m-0 break-words text-sm font-medium">
              <Link href={info.destination} target="_blank" rel="noopener noreferrer" underline="hover">
                {info.destination}
              </Link>
            </p>
          ) : error ? (
            <p className="m-0 text-sm text-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="m-0 text-sm text-muted" role="status">
              Consultando…
            </p>
          )}
        </div>
        {info && !readOnly ? (
          <Button size="small" variant="outlined" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)} className="!rounded-full">
            Cambiar destino
          </Button>
        ) : null}
      </div>
      {info && info.history.length > 0 ? (
        <p className="m-0 text-xs text-muted">
          Se ha cambiado {info.history.length === 1 ? "1 vez" : `${info.history.length} veces`}; el QR sigue siendo el mismo.
        </p>
      ) : null}
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
        <ModalLayout.Header id={`${id}-title`} onClose={onClose} closeDisabled={busy}>
          Cambiar el destino
        </ModalLayout.Header>
        <ModalLayout.Body>
          <ModalLayout.Callout className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Link impreso en el QR (permanente)</span>
              <strong className="break-all text-xs text-primary">{info.shortUrl}</strong>
            </div>
            <p className="m-0 text-xs text-muted">
              El código QR de la placa no cambia. Al guardar, cualquier escaneo redirigirá de inmediato a la dirección nueva.
            </p>
          </ModalLayout.Callout>
          <TextField
            autoFocus
            label="Destino nuevo"
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { inputMode: "url", autoComplete: "off", spellCheck: false } }}
          />
          {error ? (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          ) : null}
        </ModalLayout.Body>
        <ModalLayout.Footer
          leading={
            <Button onClick={onClose} disabled={busy} color="inherit">
              Cancelar
            </Button>
          }
        >
          <Button type="submit" variant="contained" disabled={busy || unchanged}>
            Guardar destino
          </Button>
        </ModalLayout.Footer>
      </form>
    </Dialog>
  );
}
