

import { FIELD_MAX_LENGTH, FIELD_RULES, TEXT_FIELDS } from "@/schemas/record";
import { ExistingQrUrlSchema, GeneratedQrUrlSchema } from "@/schemas/url";
import { normalizeText } from "@/lib/text/normalize";
import type { BindableField, FieldKey, QRRecord, RecordDraft, RecordDraftInput, ValidationIssue } from "@/types";

import { fieldIssueText, type FieldIssueCode } from "./messages.es";
import { usesPlainHttp } from "./url";

export interface FieldCheck {
  field: FieldKey;
  code: FieldIssueCode;
  severity: "error" | "warning";
  /** Valor original (para el informe de importación). */
  value: string;
}

type FieldResult = { ok: true; value: string; warnings: FieldCheck[] } | { ok: false; issue: FieldCheck };

const asString = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

/** Valida un campo enlazable con FIELD_RULES y traduce el fallo a un código del catálogo. */
export function checkField(field: BindableField, raw: unknown): FieldResult {
  const value = asString(raw);
  const result = FIELD_RULES[field].safeParse(raw);
  if (!result.success) {
    const empty = normalizeText(value) === "";
    const code: FieldIssueCode = empty ? "REQUIRED_EMPTY" : field === "menuUrl" ? "INVALID_URL" : "TOO_LONG";
    return { ok: false, issue: { field, code, severity: "error", value } };
  }
  const warnings: FieldCheck[] =
    field === "menuUrl" && usesPlainHttp(result.data) ? [{ field, code: "HTTP_URL", severity: "warning", value }] : [];
  return { ok: true, value: result.data, warnings };
}

/** Link del QR aportado por el usuario: vacío = sin QR (se generará); presente = https válido. */
export function checkExistingQrUrl(raw: unknown): { ok: true; value: string | undefined } | { ok: false; issue: FieldCheck } {
  const value = asString(raw).trim();
  if (value === "") return { ok: true, value: undefined };
  const result = ExistingQrUrlSchema.safeParse(value);
  if (!result.success) return { ok: false, issue: { field: "qrUrl", code: "INVALID_URL", severity: "error", value } };
  return { ok: true, value: result.data };
}

export type DraftValidation =
  | { ok: true; draft: RecordDraft; warnings: FieldCheck[] }
  | { ok: false; issues: FieldCheck[]; warnings: FieldCheck[] };

const BINDABLE: readonly BindableField[] = [...TEXT_FIELDS, "menuUrl"];

/** Validación estricta campo a campo (formulario y filas de Excel). Reporta todos los problemas a la vez. */
export function validateDraft(input: RecordDraftInput): DraftValidation {
  const values: Partial<Record<BindableField, string>> = {};
  const issues: FieldCheck[] = [];
  const warnings: FieldCheck[] = [];

  for (const field of BINDABLE) {
    const result = checkField(field, input[field]);
    if (result.ok) {
      values[field] = result.value;
      warnings.push(...result.warnings);
    } else {
      issues.push(result.issue);
    }
  }
  const qr = checkExistingQrUrl(input.qrUrl);
  if (!qr.ok) issues.push(qr.issue);

  if (issues.length > 0 || !qr.ok) return { ok: false, issues, warnings };
  const draft: RecordDraft = {
    area: values.area ?? "",
    estacion: values.estacion ?? "",
    mesa: values.mesa ?? "",
    subgrupo: values.subgrupo ?? "",
    concepto: values.concepto ?? "",
    menuUrl: values.menuUrl ?? "",
    ...(qr.value === undefined ? {} : { qrUrl: qr.value }),
  };
  return { ok: true, draft, warnings };
}

export function toValidationIssue(check: FieldCheck): ValidationIssue {
  const max = check.field in FIELD_MAX_LENGTH ? FIELD_MAX_LENGTH[check.field as keyof typeof FIELD_MAX_LENGTH] : undefined;
  return {
    field: check.field,
    code: check.code,
    message: fieldIssueText(check.field, check.code, max).message,
    severity: check.severity,
  };
}

const invariant = (message: string): ValidationIssue => ({ field: "record", code: "INVARIANT", message, severity: "error" });

/**
 * Reglas estrictas sobre un registro guardado (tras cada mutación y al
 * hidratar). Un registro con errores sigue visible y editable, pero no se exporta.
 */
export function validateRecord(record: QRRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of BINDABLE) {
    const result = checkField(field, record[field]);
    if (result.ok) issues.push(...result.warnings.map(toValidationIssue));
    else issues.push(toValidationIssue(result.issue));
  }

  switch (record.qr.source) {
    case "none":
      if (record.qrUrl !== undefined) issues.push(invariant("Hay un Link del QR sin QR asociado"));
      break;
    case "generated":
      if (record.qrUrl === undefined || !GeneratedQrUrlSchema.safeParse(record.qrUrl).success) {
        issues.push(invariant("El link del QR generado es inválido"));
      }
      break;
    case "existing": {
      const qr = checkExistingQrUrl(record.qrUrl);
      if (record.qrUrl === undefined) issues.push(invariant("QR existente sin Link del QR"));
      else if (!qr.ok) issues.push(toValidationIssue(qr.issue));
      break;
    }
  }
  return issues;
}

export const hasBlockingErrors = (issues: readonly ValidationIssue[]): boolean =>
  issues.some((issue) => issue.severity === "error");

