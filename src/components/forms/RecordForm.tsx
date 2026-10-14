"use client";

import CloseIcon from "@mui/icons-material/Close";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useDeferredValue, useId, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";

import { isOwnLink } from "@/lib/links/own-links";
import { shortenMany } from "@/lib/links/shorten-many";
import { createRecord } from "@/lib/records/factory";
import { findExistingDuplicate } from "@/lib/records/duplicates";
import { useProject, useRuntime } from "@/lib/state/StoreProvider";
import { MenuUrlSchema } from "@/schemas/url";
import { EMPTY_FORM, formValuesOf, validateForm, type FormValues } from "@/lib/validation/form";
import { FIELD_LABELS } from "@/lib/validation/messages.es";
import type { FieldKey, QRRecord } from "@/types";

import { ResortLinkPicker } from "./ResortLinkPicker";
import { TilePreview } from "@/components/preview/TilePreview";
import { QrStatusBadge } from "@/components/records/QrStatusBadge";
import type { RecordDraft } from "@/types";

export interface RecordFormProps {
  open: boolean;
  /** Pieza que se edita; null = alta nueva. */
  record: QRRecord | null;
  onClose(): void;
  /** Devuelve true si se guardó (false = la persona canceló una confirmación y el formulario sigue abierto). */
  onSubmit(draft: RecordDraft): Promise<boolean>;
}

interface FieldSpec {
  name: keyof FormValues;
  help?: string;
  placeholder?: string;
  type?: "url";
  required?: boolean;
}

const FIELDS: FieldSpec[] = [
  { name: "area", required: true, placeholder: "Tropical" },
  { name: "estacion", placeholder: "Bar" },
  { name: "mesa", required: true, placeholder: "M1" },
  { name: "subgrupo" },
  { name: "concepto" },
  { name: "menuUrl", required: true, type: "url", placeholder: "https://menu.ejemplo.com/tropical", help: "Se acorta automáticamente al guardar: el QR lleva el link corto, que no cambia aunque cambie el destino." },
  { name: "qrUrl", type: "url", placeholder: "https://…/qr.svg", help: "Opcional. Vacío: se genera un QR nuevo. Con un link: se usa ese QR (un SVG) y NO se genera otro." },
];

const label = (name: keyof FormValues) => FIELD_LABELS[name as FieldKey];

/** Formulario manual de una pieza (spec §4A): Área, Estación, Mesa, Sub-grupo, Concepto, Link del menú y Link del QR. */
export function RecordForm({ open, record, onClose, onSubmit }: RecordFormProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const formId = useId();
  const [busy, setBusy] = useState(false);

  // El cuerpo se monta al abrir y se desmonta al cerrar: cada apertura empieza con estado nuevo.
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="md" aria-labelledby={`${formId}-title`}>
      <RecordFormBody formId={formId} record={record} busy={busy} setBusy={setBusy} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

interface BodyProps {
  formId: string;
  record: QRRecord | null;
  busy: boolean;
  setBusy(busy: boolean): void;
  onClose(): void;
  onSubmit(draft: RecordDraft): Promise<boolean>;
}

function RecordFormBody({ formId, record, busy, setBusy, onClose, onSubmit }: BodyProps) {
  const [values, setValues] = useState<FormValues>(() =>
    record ? formValuesOf({ area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl, ...(record.qrUrl === undefined ? {} : { qrUrl: record.qrUrl }) }) : EMPTY_FORM,
  );
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  // El Link del menú se acorta ahí mismo, al pegarlo o al salir del campo: la persona ve el link corto (el que lleva el QR).
  // Guardar NO espera a este acortado (un clic en «Guardar» justo al salir del campo se perdería si el botón se desactivara):
  // al guardar, `prepareDraft` vuelve a acortar —es idempotente: mismo link, mismo código— y el resultado es el mismo.
  const runtime = useRuntime();
  const [shortening, setShortening] = useState(false);
  const [shortenedFrom, setShortenedFrom] = useState<string | null>(null);
  const [shortenError, setShortenError] = useState<string | null>(null);
  const shortened = useRef(new Map<string, string>());

  async function shortenField(raw: string) {
    const url = raw.trim();
    // Nada que acortar: vacío, inválido, ya corto o propio, o el link que la pieza ya tenía (cambiarlo desactualizaría su QR).
    if (url === "" || isOwnLink(url) || !MenuUrlSchema.safeParse(url).success || url === record?.menuUrl) return;
    setShortenError(null);
    const known = shortened.current.get(url);
    if (known) return void setValues((v) => (v.menuUrl.trim() === url ? { ...v, menuUrl: known } : v));
    setShortening(true);
    try {
      const { map } = await shortenMany([url], runtime.fetchShorten);
      const short = map.get(url);
      if (short && short !== url) {
        shortened.current.set(url, short);
        // Solo si la persona no siguió editando el campo mientras tanto.
        setValues((v) => (v.menuUrl.trim() === url ? { ...v, menuUrl: short } : v));
        setShortenedFrom(url);
      }
    } catch {
      setShortenError("No se pudo acortar ahora; se intentará de nuevo al guardar.");
    } finally {
      setShortening(false);
    }
  }

  const recordsById = useProject((p) => p.recordsById);
  const duplicateKey = useProject((p) => p.duplicateKey);

  const validation = useMemo(() => validateForm(values), [values]);
  const duplicate = useMemo(() => (validation.draft ? findExistingDuplicate(validation.draft, Object.values(recordsById), duplicateKey, record?.id) : null), [validation.draft, recordsById, duplicateKey, record?.id]);

  // La vista previa se actualiza mientras se escribe, sin bloquear el teclado.
  const deferred = useDeferredValue(values);
  const previewRecord = useMemo<QRRecord>(() => {
    const base = record ?? createRecord({ area: "", estacion: "", mesa: "", subgrupo: "", concepto: "", menuUrl: "" }, { now: "2026-01-01T00:00:00.000Z", order: 0, origin: "manual", id: "borrador" });
    return { ...base, area: deferred.area, estacion: deferred.estacion, mesa: deferred.mesa, subgrupo: deferred.subgrupo, concepto: deferred.concepto, menuUrl: deferred.menuUrl.trim() };
  }, [deferred, record]);

  /** Lo que se dice bajo el Link del menú mientras se acorta, tras acortarlo o si no se pudo. */
  const menuHelp = (): string | null => {
    if (shortening) return "Acortando el link…";
    return shortenError;
  };
  const shortenedNote = (): string | null =>
    shortenedFrom && values.menuUrl.trim() !== shortenedFrom ? `Link acortado: el QR lleva este link corto y no cambia aunque cambie el destino. Destino: ${shortenedFrom}` : null;

  const shown = (name: keyof FormValues) => (submitted || touched[name]) && validation.errors[name as FieldKey];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!validation.draft || busy) return;
    setBusy(true);
    const saved = await onSubmit(validation.draft);
    setBusy(false);
    if (saved) onClose();
  }

  return (
    <>
      <DialogTitle id={`${formId}-title`} className="flex items-center justify-between gap-2">
        {record ? "Editar pieza" : "Agregar nueva pieza"}
        <IconButton aria-label="Cerrar" onClick={onClose} disabled={busy} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
          <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
            <ResortLinkPicker disabled={busy} onPick={(url) => setValues((v) => ({ ...v, menuUrl: url }))} />
            {FIELDS.map((field, index) => (
              <TextField
                key={field.name}
                name={field.name}
                label={label(field.name)}
                value={values[field.name]}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                onBlur={() => {
                  setTouched((t) => ({ ...t, [field.name]: true }));
                  if (field.name === "menuUrl") void shortenField(values.menuUrl);
                }}
                {...(field.name === "menuUrl"
                  ? {
                      onPaste: (event: ClipboardEvent) => {
                        const text = event.clipboardData.getData("text").trim();
                        if (text === "") return;
                        event.preventDefault();
                        setValues((v) => ({ ...v, menuUrl: text }));
                        setShortenedFrom(null);
                        void shortenField(text);
                      },
                    }
                  : {})}
                required={field.required}
                autoFocus={index === 0}
                placeholder={field.placeholder}
                type={field.type === "url" ? "url" : "text"}
                slotProps={{
                  htmlInput: { autoComplete: "off", inputMode: field.type === "url" ? "url" : "text", spellCheck: field.type !== "url" },
                  ...(field.name === "menuUrl" && shortening ? { input: { endAdornment: <InputAdornment position="end"><CircularProgress size={18} aria-label="Acortando el link" /></InputAdornment> } } : {}),
                }}
                error={Boolean(shown(field.name))}
                helperText={(field.name === "menuUrl" ? menuHelp() : null) || shown(field.name) || (field.name === "menuUrl" ? shortenedNote() : null) || validation.warnings[field.name as FieldKey] || field.help}
                disabled={busy}
              />
            ))}
            {duplicate ? <Alert severity="warning">Ya hay una pieza igual: {[duplicate.mesa, duplicate.area].filter(Boolean).join(" · ")}. Puedes guardarla de todos modos.</Alert> : null}
          </form>
          <aside aria-label="Vista previa" className="flex flex-col gap-2">
            <TilePreview record={previewRecord} />
            {record ? <QrStatusBadge record={record} /> : null}
            <p className="m-0 text-xs text-muted">Vista previa de la pieza. {record ? "" : "El QR se genera al guardar."}</p>
          </aside>
        </div>
      </DialogContent>
      <DialogActions className="px-6 py-3">
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" form={formId} variant="contained" disabled={busy || (submitted && !validation.draft)}>
          {record ? "Guardar cambios" : "Agregar pieza"}
        </Button>
      </DialogActions>
    </>
  );
}
