/**
 * FY1404 import pipeline — shared types.
 *
 * Stage model (docs/IMPORT_PIPELINE.md):
 *   1 source_file_registration  2 hash_verification   3 batch_creation
 *   4 raw_preservation          5 normalization       6 staging_validation
 *   7 duplicate_detection       8 reconciliation      9 authorized_posting
 *
 * The pipeline is idempotent: identical bytes + fiscal year + pipeline
 * version always resolve to the same source file, batch and staging rows.
 */

import type { CurrencyCode } from "@/lib/money";

export const PIPELINE_VERSION = "fy1404-import@1";

/** Requirement-level stage ids (reported in PipelineReport + UI stepper). */
export const PIPELINE_STAGES = [
  "source_file_registration",
  "hash_verification",
  "batch_creation",
  "raw_preservation",
  "normalization",
  "staging_validation",
  "duplicate_detection",
  "reconciliation",
  "authorized_posting",
] as const;
export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

/** Database stage enum values (supabase/migrations ...0005). */
export type DbImportStage =
  | "source_registered"
  | "hash_verified"
  | "raw_preserved"
  | "normalized"
  | "validated"
  | "duplicates_detected"
  | "reconciled"
  | "posting"
  | "posted";

export type BatchStatus =
  | "created"
  | "running"
  | "ready_to_post"
  | "posting"
  | "posted"
  | "failed"
  | "cancelled";

export type RecordKind =
  | "document"
  | "bank_transaction"
  | "sales_invoice"
  | "purchase_invoice"
  | "journal_candidate"
  | "tax_return"
  | "fixed_asset";

/** Record kinds this pipeline version can normalize AND post. */
export const POSTABLE_RECORD_KINDS: readonly RecordKind[] = [
  "document",
  "journal_candidate",
];

export type ValidationStatus = "pending" | "valid" | "invalid";
export type DuplicateStatus = "unknown" | "unique" | "duplicate";
export type PostStatus = "pending" | "posted" | "skipped" | "failed";
export type IssueSeverity = "error" | "warning" | "info";

/** One raw input record (from CSV or a structured source). */
export interface SourceRecord {
  rowNo: number;
  fields: Record<string, string>;
  /** Journal candidate line items (structured sources). */
  lines?: JournalLineSource[];
}

export interface JournalLineSource {
  account_code: string;
  side: "debit" | "credit";
  /** Exact integer amount string — never a float. */
  amount: string;
  currency?: string;
  description?: string;
}

export interface NormalizedJournalLine {
  accountCode: string;
  side: "debit" | "credit";
  /** Exact integer string. */
  amount: string;
  currency: CurrencyCode | null;
  description?: string;
}

/** Type-checked, canonical representation of one source record. */
export interface NormalizedRecord {
  kind: RecordKind;
  /** Canonical ISO date or null when the source does not state one. */
  date: string | null;
  dateParseFailed: boolean;
  documentType?: string;
  documentNo?: string;
  /** Exact integer string or null. */
  amount: string | null;
  amountParseFailed: boolean;
  currency: CurrencyCode | null;
  description?: string;
  counterpartyName?: string;
  referenceNo?: string;
  memo?: string;
  lines?: NormalizedJournalLine[];
}

export interface NormalizationError {
  code: string;
  messageFa: string;
  field?: string;
}

export interface ValidationIssueDraft {
  severity: IssueSeverity;
  code: string;
  messageFa: string;
  sourceRef?: string;
  /** Set by the pipeline once the staging row id is known. */
  stagingRecordId?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface StageReport {
  stage: PipelineStageId;
  status: "ok" | "failed" | "skipped";
  detail: string;
  at: string;
}

export interface ExpectedTotals {
  rows?: number;
  totalAmount?: string;
  currency?: CurrencyCode;
}

export interface ReconciliationSummary {
  status: "matched" | "mismatched" | "partial";
  expected: ExpectedTotals | null;
  actual: {
    rows: number;
    totalsByCurrency: Record<string, string>;
  };
  differences: string[];
}

export interface PipelineCounts {
  records: number;
  valid: number;
  invalid: number;
  duplicates: number;
  openErrors: number;
}

export interface PipelineReport {
  pipelineVersion: string;
  idempotencyKey: string;
  sourceFileId: string;
  sourceFileCreated: boolean;
  batchId: string;
  batchCreated: boolean;
  /** True when this run resolved to an already-existing import batch. */
  alreadyImported: boolean;
  stages: StageReport[];
  counts: PipelineCounts;
  batchStatus: BatchStatus;
  batchStage: DbImportStage;
  reconciliation: ReconciliationSummary | null;
  readyToPost: boolean;
}

export class PipelineError extends Error {
  readonly stage: PipelineStageId;
  readonly code: string;
  constructor(stage: PipelineStageId, code: string, message: string) {
    super(message);
    this.name = "PipelineError";
    this.stage = stage;
    this.code = code;
  }
}

/** Staging row shape shared by repository implementations. */
export interface StagingRow {
  id: string;
  companyId: string;
  fiscalYearId: string;
  importBatchId: string;
  recordKind: RecordKind;
  sourceRowNo: number;
  sourceLineHash: string;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
  validationStatus: ValidationStatus;
  validationErrors: unknown[];
  duplicateStatus: DuplicateStatus;
  duplicateOfDocumentId: string | null;
  postStatus: PostStatus;
  postedDocumentId: string | null;
  postedJournalEntryId: string | null;
}

export interface SourceFileRow {
  id: string;
  companyId: string;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  contentSha256: string;
  byteSize: number;
  mimeType: string | null;
  rawPreserved: boolean;
}

export interface BatchRow {
  id: string;
  companyId: string;
  fiscalYearId: string;
  sourceFileId: string;
  pipelineVersion: string;
  idempotencyKey: string;
  status: BatchStatus;
  stage: DbImportStage;
  expectedTotals: ExpectedTotals | null;
  reconciliationSummary: ReconciliationSummary | null;
  stats: Record<string, unknown>;
  errorSummary: string | null;
  approvalId: string | null;
}
