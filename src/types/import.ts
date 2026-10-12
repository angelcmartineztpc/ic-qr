import type { z } from "zod";

import type {
  ColumnMappingSchema,
  DuplicateDecisionSchema,
  DuplicateGroupSchema,
  DuplicateKeyConfigSchema,
  DuplicateStrategySchema,
  ImportedRowSchema,
  ImportIssueCodeSchema,
  ImportIssueSchema,
  ImportResponseSchema,
  ImportResultSchema,
  RejectedRowSchema,
} from "@/schemas/import";

export type ImportIssueCode = z.output<typeof ImportIssueCodeSchema>;
export type ImportIssue = z.output<typeof ImportIssueSchema>;
export type ColumnMapping = z.output<typeof ColumnMappingSchema>;
export type ImportedRow = z.output<typeof ImportedRowSchema>;
export type RejectedRow = z.output<typeof RejectedRowSchema>;
export type DuplicateGroup = z.output<typeof DuplicateGroupSchema>;
export type DuplicateStrategy = z.output<typeof DuplicateStrategySchema>;
export type DuplicateDecision = z.output<typeof DuplicateDecisionSchema>;
export type DuplicateKeyConfig = z.output<typeof DuplicateKeyConfigSchema>;
export type ImportResult = z.output<typeof ImportResultSchema>;
export type ImportResponse = z.output<typeof ImportResponseSchema>;

/** Lo que muestra ImportSummary. Invariante: totalRows === valid + withErrors + duplicates. */
export interface ImportDisplayStats {
  totalRows: number;
  valid: number;
  withErrors: number;
  /** Duplicados de archivo ∪ proyecto; una fila cuenta una sola vez. */
  duplicates: number;
}
