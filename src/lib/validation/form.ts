import { findUnsupportedChars } from "@/lib/document/charset";
import { TEXT_FIELDS, FIELD_MAX_LENGTH } from "@/schemas/record";
import type { FieldKey, RecordDraft } from "@/types";

import { FIELD_LABELS, fieldIssueText } from "./messages.es";
import { validateDraft } from "./validate";

/** Valores tal como se escriben en el formulario (siempre texto libre, decisión R1). */
export interface FormValues {
  area: string;
  estacion: string;
  mesa: string;
  subgrupo: string;
  concepto: string;
  menuUrl: string;
  qrUrl: string;
}

export const EMPTY_FORM: FormValues = { area: "", estacion: "", mesa: "", subgrupo: "", concepto: "", menuUrl: "", qrUrl: "" };

export interface FormValidation {
  /** Datos listos para guardar (null mientras haya errores). */
  draft: RecordDraft | null;
  /** Mensaje por campo; el formulario los muestra tras tocar el campo o al intentar guardar. */
  errors: Partial<Record<FieldKey, string>>;
  /** Avisos que no impiden guardar. */
  warnings: Partial<Record<FieldKey, string>>;
}

/** Validación en vivo del formulario: las mismas reglas que Excel, la API y la exportación (§27). */
export function validateForm(values: FormValues): FormValidation {
  const result = validateDraft(values);
  const errors: FormValidation["errors"] = {};
  const warnings: FormValidation["warnings"] = {};

  if (!result.ok) {
    for (const issue of result.issues) {
      const max = issue.field in FIELD_MAX_LENGTH ? FIELD_MAX_LENGTH[issue.field as keyof typeof FIELD_MAX_LENGTH] : undefined;
      errors[issue.field] = fieldIssueText(issue.field, issue.code, max).message;
    }
  }
  for (const warning of result.warnings) warnings[warning.field] = "La URL usa http; se recomienda https";

  for (const field of TEXT_FIELDS) {
    const unsupported = findUnsupportedChars(values[field]);
    if (unsupported.length > 0) {
      warnings[field] = `${FIELD_LABELS[field]} contiene ${unsupported.map((c) => `«${c}»`).join(" ")}: la fuente de la pieza no lo tiene y no se imprimirá`;
    }
  }
  return { draft: result.ok ? result.draft : null, errors, warnings };
}

export function formValuesOf(draft: RecordDraft): FormValues {
  return { area: draft.area, estacion: draft.estacion, mesa: draft.mesa, subgrupo: draft.subgrupo, concepto: draft.concepto, menuUrl: draft.menuUrl, qrUrl: draft.qrUrl ?? "" };
}
