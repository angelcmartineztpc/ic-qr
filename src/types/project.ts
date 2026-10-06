import type { z } from "zod";

import type { PersistedProjectSchema, ProjectFileSchema, QuarantineEntrySchema, StoredExportOptionsSchema } from "@/schemas/project";

import type { RecordId } from "./common";
import type { QRRecord } from "./record";

export type QuarantineEntry = z.output<typeof QuarantineEntrySchema>;
export type StoredExportOptions = z.output<typeof StoredExportOptionsSchema>;
export type PersistedProject = z.output<typeof PersistedProjectSchema>;
export type ProjectFile = z.output<typeof ProjectFileSchema>;

/** Proyecto en memoria: como el persistido, pero con registros ya validados. */
export type ProjectState = Omit<PersistedProject, "recordsById"> & { recordsById: Record<RecordId, QRRecord> };
