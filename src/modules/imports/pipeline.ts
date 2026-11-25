/**
 * FY1404 import pipeline orchestrator.
 *
 * Repeatable and idempotent by construction:
 *  - same bytes + company + fiscal year + pipeline version
 *    -> same source file, same batch, same staging rows;
 *  - re-running never resets posted state and never duplicates records;
 *  - a posted batch short-circuits to an already-imported report.
 *
 * Stages (requirement order): source file registration, hash verification,
 * batch creation, raw source preservation, normalization, staging
 * validation, duplicate detection, reconciliation, authorized posting
 * (posting is a separate, approval-gated call — never automatic).
 */

import {
  computeContentHash,
  computeIdempotencyKey,
  computeLineHash,
  sha256Hex,
} from "./hashing";
import { parseCsv } from "./csv";
import { normalizeSourceRecord } from "./normalize";
import { validateNormalizedRecord } from "./validate";
import { detectDuplicates } from "./duplicates";
import { reconcileBatch } from "./reconcile";
import { PIPELINE_VERSION } from "./types";
import type {
  ExpectedTotals,
  NormalizedRecord,
  PipelineReport,
  PipelineStageId,
  RecordKind,
  StageReport,
  ValidationIssueDraft,
} from "./types";
import { PipelineError } from "./types";
import type { IssueDraftInput, PipelineDeps, StagingUpsertInput } from "./repositories";
import type { CurrencyCode } from "@/lib/money";

export interface PipelineInput {
  companyId: string;
  fiscalYearId: string;
  /** Canonical ISO window of the fiscal year (for date validation). */
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  originalFilename: string;
  /** Raw source bytes (string is encoded as UTF-8). */
  content: string | Uint8Array;
  storageBucket: string;
  storagePath: string;
  mimeType?: string | null;
  /**
   * Pre-parsed records (structured sources). When omitted, `content` is
   * parsed as CSV (header row + data rows).
   */
  records?: SourceRecordsInput[];
  /** Fallback record kind when rows carry no record_kind column. */
  defaultRecordKind?: RecordKind;
  /** Explicit operator-declared currency for rows that state no unit. */
  declaredCurrency?: CurrencyCode | null;
  /** Expectations declared by the source header (never inferred). */
  expectedTotals?: ExpectedTotals | null;
  /** Declared hash for verification; mismatch aborts before any write. */
  declaredSha256?: string;
}

type SourceRecordsInput = import("./types").SourceRecord;

export interface AuthorizeAndPostInput {
  batchId: string;
  actorUserId: string;
}

export interface AuthorizeAndPostReport {
  batchId: string;
  alreadyPosted: boolean;
  postedJournalEntries: number;
  postedDocuments: number;
}

export async function runImportPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineReport> {
  const stages: StageReport[] = [];
  const now = () => deps.nowIso();
  const mark = (
    stage: PipelineStageId,
    status: StageReport["status"],
    detail: string,
  ) => {
    stages.push({ stage, status, detail, at: now() });
  };

  // ---- bytes + hash verification (before any write) --------------------
  const bytes =
    typeof input.content === "string"
      ? Buffer.from(input.content, "utf8")
      : input.content;
  const sha256 = sha256Hex(bytes);
  if (input.declaredSha256 && input.declaredSha256 !== sha256) {
    mark(
      "hash_verification",
      "failed",
      `declared ${input.declaredSha256} != computed ${sha256}`,
    );
    throw new PipelineError(
      "hash_verification",
      "HASH_MISMATCH",
      "declared file hash does not match the computed sha256",
    );
  }
  mark("hash_verification", "ok", `sha256=${sha256}`);

  // ---- 1) source file registration ------------------------------------
  const { file, created: fileCreated } = await deps.sourceFiles.register({
    companyId: input.companyId,
    originalFilename: input.originalFilename,
    storageBucket: input.storageBucket,
    storagePath: input.storagePath,
    contentSha256: sha256,
    byteSize: bytes.byteLength,
    mimeType: input.mimeType ?? null,
  });
  mark(
    "source_file_registration",
    "ok",
    fileCreated ? `registered ${file.id}` : `existing ${file.id}`,
  );

  // ---- 3) batch creation (idempotency key covers stage 2 anchor) -------
  const idempotencyKey = computeIdempotencyKey({
    companyId: input.companyId,
    fiscalYearId: input.fiscalYearId,
    sourceSha256: sha256,
    pipelineVersion: PIPELINE_VERSION,
  });
  const { batch, created: batchCreated } = await deps.batches.findOrCreate({
    companyId: input.companyId,
    fiscalYearId: input.fiscalYearId,
    sourceFileId: file.id,
    pipelineVersion: PIPELINE_VERSION,
    idempotencyKey,
    expectedTotals: input.expectedTotals ?? null,
  });
  mark(
    "batch_creation",
    "ok",
    batchCreated ? `created ${batch.id}` : `existing ${batch.id} (idempotent)`,
  );

  // A posted batch is final: re-import reports success without mutating it.
  if (batch.status === "posted") {
    const stagingRows = await deps.staging.listByBatch(batch.id);
    return {
      pipelineVersion: PIPELINE_VERSION,
      idempotencyKey,
      sourceFileId: file.id,
      sourceFileCreated: fileCreated,
      batchId: batch.id,
      batchCreated: false,
      alreadyImported: true,
      stages,
      counts: {
        records: stagingRows.length,
        valid: stagingRows.filter((r) => r.validationStatus === "valid").length,
        invalid: stagingRows.filter((r) => r.validationStatus === "invalid").length,
        duplicates: stagingRows.filter((r) => r.duplicateStatus === "duplicate").length,
        openErrors: await deps.issues.countOpenErrors(batch.id),
      },
      batchStatus: batch.status,
      batchStage: batch.stage,
      reconciliation: batch.reconciliationSummary,
      readyToPost: false,
    };
  }

  await deps.batches.updateState(batch.id, { status: "running" });

  // ---- 4) raw source preservation -------------------------------------
  if (!file.rawPreserved) {
    try {
      await deps.preserver.preserve(file);
      await deps.sourceFiles.markPreserved(file.id);
      mark("raw_preservation", "ok", `preserved ${file.storagePath}`);
    } catch (err) {
      await deps.batches.updateState(batch.id, {
        status: "failed",
        errorSummary: `RAW_PRESERVATION_FAILED: ${(err as Error).message}`,
      });
      mark("raw_preservation", "failed", (err as Error).message);
      throw err;
    }
  } else {
    mark("raw_preservation", "skipped", "already preserved");
  }

  // ---- parse source into records ---------------------------------------
  let records: SourceRecordsInput[];
  if (input.records) {
    records = input.records;
  } else if (typeof input.content === "string") {
    records = parseCsv(input.content);
  } else {
    throw new PipelineError(
      "normalization",
      "RECORDS_REQUIRED",
      "binary sources must supply pre-parsed records",
    );
  }

  // ---- 5) normalization -------------------------------------------------
  const stagingInputs: StagingUpsertInput[] = [];
  const normalizedByHash = new Map<string, NormalizedRecord>();
  for (const record of records) {
    const { normalized } = normalizeSourceRecord(record, {
      defaultKind: input.defaultRecordKind,
      declaredCurrency: input.declaredCurrency ?? null,
    });
    const lineHash = computeLineHash(record);
    normalizedByHash.set(lineHash, normalized);
    stagingInputs.push({
      importBatchId: batch.id,
      companyId: input.companyId,
      fiscalYearId: input.fiscalYearId,
      recordKind: normalized.kind,
      sourceRowNo: record.rowNo,
      sourceLineHash: lineHash,
      payload: { fields: record.fields, lines: record.lines ?? [] },
      normalized: normalized as unknown as Record<string, unknown>,
    });
  }
  await deps.staging.upsert(stagingInputs);
  await deps.batches.updateState(batch.id, { stage: "normalized" });
  mark("normalization", "ok", `${stagingInputs.length} records normalized`);

  const stagingRows = await deps.staging.listByBatch(batch.id);
  const rowByHash = new Map(stagingRows.map((r) => [r.sourceLineHash, r]));

  // ---- 6) staging validation -------------------------------------------
  const accountCodes = await deps.catalog.listPostableAccountCodes(input.fiscalYearId);
  const validationIssues: ValidationIssueDraft[] = [];
  const validationResults: Array<{
    sourceLineHash: string;
    status: "valid" | "invalid";
    errors: unknown[];
  }> = [];
  for (const [lineHash, normalized] of normalizedByHash) {
    const row = rowByHash.get(lineHash);
    const sourceRef = row ? `ردیف ${row.sourceRowNo}` : `ردیف ${lineHash.slice(0, 8)}`;
    const res = validateNormalizedRecord(
      normalized,
      {
        fiscalYear: { startDate: input.fiscalYearStartDate, endDate: input.fiscalYearEndDate },
        postableAccountCodes: accountCodes,
      },
      sourceRef,
    );
    validationResults.push({
      sourceLineHash: lineHash,
      status: res.status,
      errors: res.issues.filter((i) => i.severity === "error"),
    });
    for (const issue of res.issues) {
      validationIssues.push({
        ...issue,
        stagingRecordId: row?.id,
      });
    }
  }
  await deps.staging.applyValidation(batch.id, validationResults);
  await deps.batches.updateState(batch.id, { stage: "validated" });
  mark(
    "staging_validation",
    "ok",
    `${validationResults.filter((r) => r.status === "valid").length}/${validationResults.length} valid`,
  );

  // ---- 7) duplicate detection (valid records only) ---------------------
  const duplicateIssues: ValidationIssueDraft[] = [];
  const duplicateResults: Array<{
    sourceLineHash: string;
    duplicateStatus: "unique" | "duplicate";
    duplicateOfDocumentId: string | null;
  }> = [];
  const validRows = validationResults
    .filter((r) => r.status === "valid")
    .map((r) => {
      const row = rowByHash.get(r.sourceLineHash)!;
      return {
        sourceRowNo: row.sourceRowNo,
        sourceLineHash: row.sourceLineHash,
        normalized: normalizedByHash.get(row.sourceLineHash)!,
      };
    });
  const decisions = await detectDuplicates(
    validRows,
    { companyId: input.companyId, fiscalYearId: input.fiscalYearId },
    deps.contentProbe,
  );
  for (const d of decisions) {
    duplicateResults.push({
      sourceLineHash: d.sourceLineHash,
      duplicateStatus: d.duplicateStatus,
      duplicateOfDocumentId: d.duplicateOfDocumentId,
    });
    const row = rowByHash.get(d.sourceLineHash);
    for (const issue of d.issues) {
      duplicateIssues.push({ ...issue, stagingRecordId: row?.id });
    }
  }
  await deps.staging.applyDuplicates(batch.id, duplicateResults);
  await deps.batches.updateState(batch.id, { stage: "duplicates_detected" });
  mark(
    "duplicate_detection",
    "ok",
    `${decisions.filter((d) => d.duplicateStatus === "duplicate").length} duplicates flagged`,
  );

  // ---- 8) reconciliation ------------------------------------------------
  const expected: ExpectedTotals | null = input.expectedTotals ?? batch.expectedTotals;
  const rec = reconcileBatch({
    expected,
    records: [...normalizedByHash.values()].map((normalized) => ({ normalized })),
  });
  await deps.batches.updateState(batch.id, {
    reconciliationSummary: rec.summary,
    stage: "reconciled",
  });
  mark(
    "reconciliation",
    rec.summary.status === "mismatched" ? "failed" : "ok",
    rec.summary.status,
  );

  // ---- sync issues, then final gate ------------------------------------
  const allIssues: ValidationIssueDraft[] = [
    ...validationIssues,
    ...duplicateIssues,
    ...rec.issues,
  ];
  const issueInputs: IssueDraftInput[] = allIssues.map((i) => ({
    companyId: input.companyId,
    fiscalYearId: input.fiscalYearId,
    importBatchId: batch.id,
    stagingRecordId: i.stagingRecordId ?? null,
    sourceRef: i.sourceRef ?? null,
    severity: i.severity,
    code: i.code,
    messageFa: i.messageFa,
    field: i.field ?? null,
    details: i.details ?? null,
  }));
  await deps.issues.syncForBatch(batch.id, issueInputs);
  const openErrors = await deps.issues.countOpenErrors(batch.id);

  let status: PipelineReport["batchStatus"];
  let errorSummary: string | null;
  if (openErrors > 0) {
    status = "failed";
    errorSummary = `VALIDATION_FAILED: ${openErrors} error issue(s)`;
  } else {
    status = "ready_to_post";
    errorSummary = null;
  }
  const updated = await deps.batches.updateState(batch.id, {
    status,
    errorSummary,
    stats: {
      records: stagingInputs.length,
      valid: validationResults.filter((r) => r.status === "valid").length,
      invalid: validationResults.filter((r) => r.status === "invalid").length,
      duplicates: duplicateResults.filter((d) => d.duplicateStatus === "duplicate").length,
      openErrors,
    },
  });

  const allRows = await deps.staging.listByBatch(batch.id);
  return {
    pipelineVersion: PIPELINE_VERSION,
    idempotencyKey,
    sourceFileId: file.id,
    sourceFileCreated: fileCreated,
    batchId: batch.id,
    batchCreated,
    alreadyImported: !batchCreated,
    stages,
    counts: {
      records: allRows.length,
      valid: allRows.filter((r) => r.validationStatus === "valid").length,
      invalid: allRows.filter((r) => r.validationStatus === "invalid").length,
      duplicates: allRows.filter((r) => r.duplicateStatus === "duplicate").length,
      openErrors,
    },
    batchStatus: updated.status,
    batchStage: updated.stage,
    reconciliation: rec.summary,
    readyToPost: status === "ready_to_post",
  };
}

/**
 * Stage 9 — authorized posting. Requires an approved approval row for the
 * batch and zero open error issues; the posting routine itself is
 * idempotent (re-posting a posted batch is a no-op with no duplicates).
 */
export async function authorizeAndPost(
  input: AuthorizeAndPostInput,
  deps: PipelineDeps,
): Promise<AuthorizeAndPostReport> {
  const approved = await deps.approvalProbe.hasApprovedImportPosting(input.batchId);
  if (!approved) {
    throw new PipelineError(
      "authorized_posting",
      "APPROVAL_REQUIRED",
      "posting requires an approved post_import_batch approval",
    );
  }
  const openErrors = await deps.issues.countOpenErrors(input.batchId);
  if (openErrors > 0) {
    throw new PipelineError(
      "authorized_posting",
      "OPEN_ERROR_ISSUES",
      `${openErrors} open error issue(s) must be resolved before posting`,
    );
  }
  const res = await deps.posting.postBatch(input.batchId, input.actorUserId);
  if (!res.alreadyPosted) {
    await deps.batches.updateState(input.batchId, {
      status: "posted",
      stage: "posted",
    });
  }
  return {
    batchId: input.batchId,
    alreadyPosted: res.alreadyPosted,
    postedJournalEntries: res.postedJournalEntries,
    postedDocuments: res.postedDocuments,
  };
}

/** Exported for tests: content hash of a normalized record. */
export { computeContentHash };
