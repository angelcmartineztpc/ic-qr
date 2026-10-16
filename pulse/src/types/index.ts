// Tipos del módulo QR Producción (único archivo de tipos, según la guía de integración).
import type { z } from "zod";
import type { BoxSchema, ColorSchema, LayoutOverrideSchema, LayoutSchema, ProjectLayoutSchema } from "@/services/qr-produccion/schemas/geometry";
import type { BindableFieldSchema, ExportRecordSchema, FieldKeySchema, QrAckSchema, QrErrorCodeSchema, QrSourceInfoSchema, QrStatusSchema, RecordDraftSchema, RecordMetadataSchema, SeveritySchema, StoredRecordSchema, ValidationIssueSchema } from "@/services/qr-produccion/schemas/record";
import type { ColumnMappingSchema, DuplicateDecisionSchema, DuplicateGroupSchema, DuplicateKeyConfigSchema, DuplicateStrategySchema, ImportIssueCodeSchema, ImportIssueSchema, ImportResponseSchema, ImportResultSchema, ImportedRowSchema, RejectedRowSchema } from "@/services/qr-produccion/schemas/import";
import type { ExportOptionsSchema, ExportRequestSchema } from "@/services/qr-produccion/schemas/export";
import type { PDFOptionsSchema, PageSizeSchema } from "@/services/qr-produccion/schemas/pdf";
import type { PersistedProjectSchema, ProjectFileSchema, QuarantineEntrySchema, StoredExportOptionsSchema } from "@/services/qr-produccion/schemas/project";
import type { QrResolutionSchema, QrResolveItemSchema, QrVerifyItemSchema } from "@/services/qr-produccion/schemas/api";
import type { FitSchema, FontFileSchema, FontRefSchema, PdfPaintSchema, ShapeElementSchema, TemplateOverridesSchema, TemplateSchema, TextElementSchema } from "@/services/qr-produccion/schemas/template";

// ---- common ----
export type RecordId = string;
/** ISO-8601 con offset. */
export type IsoDateTime = string;
/** Milímetros: fuente de verdad geométrica. */
export type Mm = number;
/** Puntos tipográficos / PDF (1/72 in). */
export type Pt = number;
export type HexColor = z.output<typeof ColorSchema>;
export type Severity = z.output<typeof SeveritySchema>;
export type FieldKey = z.output<typeof FieldKeySchema>;
export type BindableField = z.output<typeof BindableFieldSchema>;

// ---- catalog ----
/** Catálogo de QR (spec §35). MVP: respaldado por el storage; futuro: tabla PostgreSQL. */
export interface QrCatalogEntry {
  id: string;
  source: "generated" | "external";
  payload: string | null;
  menuUrl: string;
  qrUrl: string;
  /** UNIQUE para generated. */
  contentHash: string | null;
  storageKey: string | null;
  rendererVersion: string | null;
  verification: "decoded" | "undecodable" | "unchecked" | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type NewQrCatalogEntry = Omit<QrCatalogEntry, "id" | "createdAt" | "updatedAt">;

export interface QrCatalog {
  findByHash(contentHash: string): Promise<QrCatalogEntry | null>;
  upsertGenerated(entry: NewQrCatalogEntry): Promise<QrCatalogEntry>;
  registerExternal(entry: NewQrCatalogEntry): Promise<QrCatalogEntry>;
}

// ---- import ----
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

// ---- layout ----
export type Box = z.output<typeof BoxSchema>;
/** Spec §15: posiciones en mm. */
export type Layout = z.output<typeof LayoutSchema>;
export type LayoutOverride = z.output<typeof LayoutOverrideSchema>;
export type ProjectLayout = z.output<typeof ProjectLayoutSchema>;
export type LayoutBoxKey = keyof Layout;

/** Spec §47. */
export type QrPreset = "bottom-center" | "bottom-left" | "bottom-right" | "center" | "custom";

export interface TileSpec {
  width: Mm;
  height: Mm;
  safeMarginMm: Mm;
}

export type LayoutWarning =
  | { code: "OVERLAP"; between: ["qr", "content"] }
  | { code: "OUTSIDE_SAFE_MARGIN"; box: LayoutBoxKey }
  | { code: "QR_MODULE_SMALL"; moduleMm: number; level: "warn" | "block" }
  | { code: "QR_NO_WHITE_BACKGROUND" }
  | { code: "QR_STYLE_LOW_CONTRAST"; part: "modules" | "eyeFrame" | "eyeBall"; ratio: number; level: "warn" | "block" }
  | { code: "QR_STYLE_INVERTED"; part: "modules" | "eyeFrame" | "eyeBall" }
  | { code: "QR_STYLE_LOGO_LARGE"; coverage: number; level: "warn" | "block" }
  | { code: "TEXT_OVERFLOW"; elementId: string; axis: "x" | "y" }
  | { code: "MISSING_GLYPH"; elementId: string; char: string };

// ---- pdf ----
export type PageSize = z.output<typeof PageSizeSchema>;
export type PDFOptions = z.output<typeof PDFOptionsSchema>;
export type ExportOptions = z.output<typeof ExportOptionsSchema>;
export type ExportRecord = z.output<typeof ExportRecordSchema>;
export type ExportRequest = z.output<typeof ExportRequestSchema>;

/** Resultado de packGrid: rejilla de piezas en la página (mm). */
export interface SheetLayout {
  pageMm: { width: Mm; height: Mm };
  orientation: "portrait" | "landscape";
  cols: number;
  rows: number;
  perPage: number;
  /** Esquina superior izquierda de la pieza (sin sangrado) del slot 0. */
  originMm: { x: Mm; y: Mm };
  /** Distancia entre piezas consecutivas (pieza + 2·sangrado + gap). */
  pitchMm: { x: Mm; y: Mm };
}

export interface PageSlot {
  page: number;
  index: number;
  xMm: Mm;
  yMm: Mm;
}

// ---- project ----
export type QuarantineEntry = z.output<typeof QuarantineEntrySchema>;
export type StoredExportOptions = z.output<typeof StoredExportOptionsSchema>;
export type PersistedProject = z.output<typeof PersistedProjectSchema>;
export type ProjectFile = z.output<typeof ProjectFileSchema>;

/** Proyecto en memoria: como el persistido, pero con registros ya validados. */
export type ProjectState = Omit<PersistedProject, "recordsById"> & { recordsById: Record<RecordId, QRRecord> };

// ---- qr ----
export interface QRRenderOptions {
  /** Único valor en el MVP (§1.2-12). */
  ecc: "high";
  marginModules: number;
  darkColor: HexColor;
  lightColor: HexColor;
  invert: boolean;
}

export type QrMatrix = boolean[][];
export type Matrix2D = [number, number, number, number, number, number];

export type ExternalNode =
  | {
      type: "path";
      d: string;
      fill: HexColor | "none";
      fillRule: "nonzero" | "evenodd";
      stroke?: HexColor;
      strokeWidth?: number;
      transform?: Matrix2D;
    }
  | { type: "rect"; x: number; y: number; w: number; h: number; fill: HexColor; transform?: Matrix2D };

export type QrGeometry =
  | { kind: "matrix"; matrix: QrMatrix; modules: number }
  | { kind: "external"; viewBox: [number, number, number, number]; nodes: ExternalNode[]; strokeBased: boolean };

export type QrResolveItem = z.output<typeof QrResolveItemSchema>;
export type QrVerifyItem = z.output<typeof QrVerifyItemSchema>;
export type QrResolution = z.output<typeof QrResolutionSchema>;

// ---- record ----
export type QrStatus = z.output<typeof QrStatusSchema>;
export type QrErrorCode = z.output<typeof QrErrorCodeSchema>;
export type QrSourceInfo = z.output<typeof QrSourceInfoSchema>;
export type GeneratedQrSource = Extract<QrSourceInfo, { source: "generated" }>;
export type ExistingQrSource = Extract<QrSourceInfo, { source: "existing" }>;
export type QrAck = z.output<typeof QrAckSchema>;
export type ValidationIssue = z.output<typeof ValidationIssueSchema>;
export type RecordMetadata = z.output<typeof RecordMetadataSchema>;
/** Spec §8, ampliado: estado del QR, errores de validación y metadatos. */
export type QRRecord = z.output<typeof StoredRecordSchema>;
/** Datos editables tras validación estricta (formulario / fila de Excel). */
export type RecordDraft = z.output<typeof RecordDraftSchema>;
/** Lo que llega del formulario o del Excel antes de validar. */
export type RecordDraftInput = Partial<Record<keyof RecordDraft, string | null | undefined>>;

// ---- scene ----
/** Representación intermedia única de una pieza (§A.7): alimenta preview, SVG y PDF. */
export interface Paint {
  rgb: HexColor;
  pdf?: PdfPaint;
}

export type SceneLayer = "background" | "artwork" | "text" | "qr" | "cutline";

export type SceneNode =
  | { type: "rect"; layer: SceneLayer; id: string; x: Mm; y: Mm; w: Mm; h: Mm; r?: Mm; fill?: Paint; stroke?: { paint: Paint; widthMm: Mm } }
  | { type: "path"; layer: SceneLayer; id: string; d: string; fill: Paint; fillRule: "nonzero" | "evenodd"; title?: string }
  | {
      type: "text";
      layer: "text";
      id: string;
      text: string;
      font: FontRef;
      sizePt: Pt;
      trackingPt: Pt;
      xMm: Mm;
      baselineMm: Mm;
      widthMm: Mm;
      fill: Paint;
    }
  | { type: "qrExternal"; layer: "qr"; id: string; box: Box; geometry: Extract<QrGeometry, { kind: "external" }> };

export interface TileScene {
  widthMm: Mm;
  heightMm: Mm;
  nodes: SceneNode[];
  warnings: LayoutWarning[];
  meta: { recordId: RecordId; templateId: string; templateVersion: string };
}

// ---- storage ----
/** Abstracción de almacenamiento (spec §10): S3, R2, Supabase, MinIO o disco local. */
export interface PutOptions {
  contentType: "image/svg+xml" | "application/json";
  cacheControl?: string;
  contentDisposition?: string;
  /** Solo crear si no existe (If-None-Match: *). */
  ifNoneMatch?: boolean;
  metadata?: Record<string, string>;
}

export interface StoredObjectRef {
  key: string;
  publicUrl: string;
  etag?: string;
}

export type PutResult = { status: "created"; object: StoredObjectRef } | { status: "exists"; object: StoredObjectRef };

export interface StorageCapabilities {
  conditionalPut: boolean;
  publicRead: boolean;
}

export interface StorageProvider {
  readonly id: "local" | "s3" | "r2";
  readonly capabilities: StorageCapabilities;
  upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult>;
  get(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; contentType?: string; etag?: string } | null>;
  head(key: string): Promise<{ metadata: Record<string, string>; etag?: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Pura, sin red. */
  getPublicUrl(key: string): string;
  /** Inversa de getPublicUrl (sin red: evita HTTP/SSRF para nuestro propio storage). */
  keyFromPublicUrl(url: string): string | null;
}

export type StorageErrorCode = "unavailable" | "forbidden" | "conflict" | "invalid-key" | "quota" | "unknown";

// ---- template ----
export type FontRef = z.output<typeof FontRefSchema>;
export type FontFile = z.output<typeof FontFileSchema>;
export type TextFit = z.output<typeof FitSchema>;
export type PdfPaint = z.output<typeof PdfPaintSchema>;
export type TextElement = z.output<typeof TextElementSchema>;
export type ShapeElement = z.output<typeof ShapeElementSchema>;
export type Template = z.output<typeof TemplateSchema>;
/** Definición de plantilla tal como se escribe en src/templates/* (con defaults sin aplicar). */
export type TemplateInput = z.input<typeof TemplateSchema>;
export type TemplateOverrides = z.output<typeof TemplateOverridesSchema>;
