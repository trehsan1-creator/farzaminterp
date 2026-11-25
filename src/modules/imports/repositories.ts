/**
 * Repository contracts for the import pipeline.
 *
 * Two implementations:
 *  - memory-repositories.ts: in-memory fake used by unit tests;
 *  - supabase-repositories.ts: production implementation over Supabase
 *    (service-role, server-side only).
 *
 * The pipeline orchestrator depends only on these interfaces, which keeps
 * idempotency behavior testable without a database.
 */

import type {
  BatchRow,
  ExpectedTotals,
  IssueSeverity,
  ReconciliationSummary,
  SourceFileRow,
  StagingRow,
  ValidationStatus,
  DuplicateStatus,
  RecordKind,
  BatchStatus,
  DbImportStage,
} from "./types";

export interface SourceFileRegisterInput {
  companyId: string;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  contentSha256: string;
  byteSize: number;
  mimeType: string | null;
}

export interface SourceFileRepo {
  /** Idempotent: same (company, sha256) always returns the same row. */
  register(input: SourceFileRegisterInput): Promise<{ file: SourceFileRow; created: boolean }>;
  markPreserved(fileId: string): Promise<void>;
}

export interface BatchFindOrCreateInput {
  companyId: string;
  fiscalYearId: string;
  sourceFileId: string;
  pipelineVersion: string;
  idempotencyKey: string;
  expectedTotals: ExpectedTotals | null;
}

export interface BatchRepo {
  /** Idempotent: same idempotency key always resolves to the same batch. */
  findOrCreate(input: BatchFindOrCreateInput): Promise<{ batch: BatchRow; created: boolean }>;
  updateState(
    batchId: string,
    patch: {
      status?: BatchStatus;
      stage?: DbImportStage;
      errorSummary?: string | null;
      reconciliationSummary?: ReconciliationSummary | null;
      stats?: Record<string, unknown>;
    },
  ): Promise<BatchRow>;
}

export interface StagingUpsertInput {
  importBatchId: string;
  companyId: string;
  fiscalYearId: string;
  recordKind: RecordKind;
  sourceRowNo: number;
  sourceLineHash: string;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
}

export interface StagingRepo {
  /**
   * Idempotent upsert keyed by (batch, source_line_hash). Existing rows keep
   * their post_status / posted ids — re-imports never reset posted state.
   */
  upsert(rows: StagingUpsertInput[]): Promise<StagingRow[]>;
  listByBatch(batchId: string): Promise<StagingRow[]>;
  applyValidation(
    batchId: string,
    results: Array<{ sourceLineHash: string; status: ValidationStatus; errors: unknown[] }>,
  ): Promise<void>;
  applyDuplicates(
    batchId: string,
    results: Array<{
      sourceLineHash: string;
      duplicateStatus: DuplicateStatus;
      duplicateOfDocumentId: string | null;
    }>,
  ): Promise<void>;
}

export interface IssueDraftInput {
  companyId: string;
  fiscalYearId: string | null;
  importBatchId: string;
  stagingRecordId: string | null;
  sourceRef: string | null;
  severity: IssueSeverity;
  code: string;
  messageFa: string;
  field: string | null;
  details: Record<string, unknown> | null;
}

export interface IssueRepo {
  /**
   * Idempotent sync: insert issues not yet present for (batch, code,
   * staging row); never duplicates on re-run.
   */
  syncForBatch(batchId: string, issues: IssueDraftInput[]): Promise<void>;
  countOpenErrors(batchId: string): Promise<number>;
  listOpenByBatch(batchId: string): Promise<IssueDraftInput[]>;
}

export interface CatalogRepo {
  /** Postable + active account codes of the fiscal year's chart. */
  listPostableAccountCodes(fiscalYearId: string): Promise<Set<string>>;
}

export interface ContentProbe {
  /** Existing posted record id for (company, fy, kind, content hash). */
  findPostedContent(input: {
    companyId: string;
    fiscalYearId: string;
    kind: RecordKind;
    contentHash: string;
  }): Promise<string | null>;
}

export interface ApprovalProbe {
  hasApprovedImportPosting(batchId: string): Promise<boolean>;
}

export interface PostingResult {
  alreadyPosted: boolean;
  postedJournalEntries: number;
  postedDocuments: number;
}

export interface PostingGateway {
  /** Calls the DB post_import_batch routine (approval-gated, idempotent). */
  postBatch(batchId: string, actorUserId: string): Promise<PostingResult>;
}

export interface RawPreserver {
  /**
   * Preserve the raw bytes in private storage. Idempotent: re-preserving
   * the same file is a no-op success.
   */
  preserve(file: SourceFileRow): Promise<void>;
}

export interface PipelineDeps {
  sourceFiles: SourceFileRepo;
  batches: BatchRepo;
  staging: StagingRepo;
  issues: IssueRepo;
  catalog: CatalogRepo;
  contentProbe: ContentProbe;
  approvalProbe: ApprovalProbe;
  posting: PostingGateway;
  preserver: RawPreserver;
  nowIso(): string;
}
