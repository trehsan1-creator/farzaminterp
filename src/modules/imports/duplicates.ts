/**
 * Duplicate detection stage.
 *
 * Two independent checks:
 *  1. within-batch: identical financial content appearing twice in the same
 *     source — flagged as a warning for review (posting keeps only one);
 *  2. against posted data: the same content hash already existing for this
 *     company + fiscal year means a re-import — must not create a second
 *     financial record (idempotency).
 */

import { computeContentHash } from "./hashing";
import type { NormalizedRecord, ValidationIssueDraft } from "./types";

export interface DuplicateCheckRow {
  sourceRowNo: number;
  sourceLineHash: string;
  normalized: NormalizedRecord;
}

export interface DuplicateDecision {
  sourceLineHash: string;
  duplicateStatus: "unique" | "duplicate";
  duplicateOfDocumentId: string | null;
  issues: ValidationIssueDraft[];
}

export interface DuplicateCheckDeps {
  /**
   * Returns the id of an existing posted record (document/journal/…) with
   * this content hash for the company + fiscal year, or null.
   */
  findPostedContent(input: {
    companyId: string;
    fiscalYearId: string;
    kind: NormalizedRecord["kind"];
    contentHash: string;
  }): Promise<string | null>;
}

export async function detectDuplicates(
  rows: DuplicateCheckRow[],
  ctx: { companyId: string; fiscalYearId: string },
  deps: DuplicateCheckDeps,
): Promise<DuplicateDecision[]> {
  const decisions: DuplicateDecision[] = [];
  const seenInBatch = new Map<string, DuplicateCheckRow>();

  for (const row of rows) {
    const issues: ValidationIssueDraft[] = [];
    const sourceRef = `ردیف ${row.sourceRowNo}`;
    const contentHash = computeContentHash(row.normalized);

    // 1) within-batch duplicate
    const first = seenInBatch.get(contentHash);
    if (first) {
      issues.push({
        severity: "warning",
        code: "DUPLICATE_WITHIN_BATCH",
        messageFa: `محتوای این ردیف با ردیف ${first.sourceRowNo} یکسان است؛ فقط یکی ثبت خواهد شد`,
        sourceRef,
      });
      decisions.push({
        sourceLineHash: row.sourceLineHash,
        duplicateStatus: "duplicate",
        duplicateOfDocumentId: null,
        issues,
      });
      continue;
    }
    seenInBatch.set(contentHash, row);

    // 2) already posted for this company + fiscal year
    const existingId = await deps.findPostedContent({
      companyId: ctx.companyId,
      fiscalYearId: ctx.fiscalYearId,
      kind: row.normalized.kind,
      contentHash,
    });
    if (existingId) {
      issues.push({
        severity: "warning",
        code: "DUPLICATE_ALREADY_POSTED",
        messageFa: "این محتوا قبلاً در سال مالی ثبت شده است؛ رکورد تکراری ساخته نمی‌شود",
        sourceRef,
        details: { existingId },
      });
      decisions.push({
        sourceLineHash: row.sourceLineHash,
        duplicateStatus: "duplicate",
        duplicateOfDocumentId:
          row.normalized.kind === "document" ? existingId : null,
        issues,
      });
      continue;
    }

    decisions.push({
      sourceLineHash: row.sourceLineHash,
      duplicateStatus: "unique",
      duplicateOfDocumentId: null,
      issues,
    });
  }

  return decisions;
}
