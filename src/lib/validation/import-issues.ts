import { FIELD_MAX_LENGTH } from "@/schemas/record";
import type { FieldKey, ImportIssue, ImportIssueCode } from "@/types";

import { duplicateInFileText, fieldIssueText } from "./messages.es";
import type { FieldCheck } from "./validate";

const IMPORT_CODE: Record<FieldCheck["code"], ImportIssueCode> = {
  REQUIRED_EMPTY: "REQUIRED_EMPTY",
  INVALID_URL: "INVALID_URL",
  TOO_LONG: "CELL_TOO_LONG",
  HTTP_URL: "HTTP_URL",
};

const truncate = (value: string) => (value.length > 200 ? `${value.slice(0, 199)}…` : value);

/** Convierte un fallo de campo en ImportIssue (§29) con el número de fila real de Excel. */
export function importIssueFromCheck(row: number, check: FieldCheck, column?: string): ImportIssue {
  const max = check.field in FIELD_MAX_LENGTH ? FIELD_MAX_LENGTH[check.field as keyof typeof FIELD_MAX_LENGTH] : undefined;
  const text = fieldIssueText(check.field, check.code, max);
  return {
    row,
    ...(column ? { column } : {}),
    field: check.field,
    value: check.value === "" ? null : truncate(check.value),
    label: text.label,
    message: text.message,
    severity: check.severity,
    code: IMPORT_CODE[check.code],
  };
}

export function duplicateInFileIssue(row: number, relatedRow: number, fields: readonly FieldKey[]): ImportIssue {
  const text = duplicateInFileText(relatedRow, fields);
  return {
    row,
    field: "record",
    value: null,
    label: text.label,
    message: text.message,
    severity: "warning",
    code: "DUPLICATE_IN_FILE",
    relatedRow,
  };
}
