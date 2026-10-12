import type { FieldKey } from "@/types";

/** Catálogo de mensajes (§C.2). label = forma corta de la lista (§6); message = detalle (§29). */
export const FIELD_LABELS: Record<FieldKey, string> = {
  area: "Área",
  estacion: "Estación",
  mesa: "Mesa",
  subgrupo: "Sub-grupo",
  concepto: "Concepto",
  menuUrl: "Link del menú",
  qrUrl: "Link del QR",
};

export type FieldIssueCode = "REQUIRED_EMPTY" | "INVALID_URL" | "TOO_LONG" | "HTTP_URL";

export interface IssueText {
  label: string;
  message: string;
}

const SPECIFIC: Partial<Record<`${FieldKey}.${FieldIssueCode}`, IssueText>> = {
  "menuUrl.REQUIRED_EMPTY": { label: "Falta Link del menú", message: "El link del menú es obligatorio" },
  "menuUrl.INVALID_URL": { label: "Link del menú inválido", message: "El link del menú no es una URL válida" },
  "menuUrl.HTTP_URL": { label: "Link del menú con http", message: "El link del menú usa http en lugar de https" },
  "mesa.REQUIRED_EMPTY": { label: "Mesa vacía", message: "La mesa es obligatoria" },
  "area.REQUIRED_EMPTY": { label: "Área vacía", message: "El área es obligatoria" },
  "qrUrl.INVALID_URL": { label: "Link del QR inválido", message: "El link del QR no es una URL https válida" },
};

export function fieldIssueText(field: FieldKey, code: FieldIssueCode, maxLength?: number): IssueText {
  const specific = SPECIFIC[`${field}.${code}`];
  if (specific) return specific;
  const label = FIELD_LABELS[field];
  switch (code) {
    case "REQUIRED_EMPTY":
      return { label: `${label} vacío`, message: `El campo ${label} es obligatorio` };
    case "INVALID_URL":
      return { label: `${label} inválido`, message: `${label} no es una URL válida` };
    case "TOO_LONG":
      return {
        label: `${label} demasiado largo`,
        message: `${label} supera ${maxLength ?? "el máximo de"} caracteres`,
      };
    case "HTTP_URL":
      return { label: `${label} con http`, message: `${label} usa http en lugar de https` };
  }
}

export function duplicateInFileText(relatedRow: number, fields: readonly FieldKey[]): IssueText {
  return {
    label: `Registro duplicado (igual a fila ${relatedRow})`,
    message: `Coincide con la fila ${relatedRow} en ${listFields(fields)}`,
  };
}

export function duplicateInProjectText(existingLabel: string, fields: readonly FieldKey[]): IssueText {
  return {
    label: `Ya existe en el proyecto (${existingLabel})`,
    message: `Coincide con la pieza ${existingLabel} del proyecto en ${listFields(fields)}`,
  };
}

function listFields(fields: readonly FieldKey[]): string {
  const labels = fields.map((field) => FIELD_LABELS[field]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1) ?? ""}`;
}

/** Línea de ErrorList: "Fila 18: Falta Link del menú". */
export function formatIssueLine(issue: { row: number | null; label: string }): string {
  return issue.row === null ? issue.label : `Fila ${issue.row}: ${issue.label}`;
}
