/**
 * Hashing primitives for import idempotency and provenance.
 * All hashes are lowercase hex sha256 — matching DB check constraints.
 */

import { createHash } from "node:crypto";
import type { NormalizedRecord, SourceRecord } from "./types";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Batch idempotency key = sha256(company | fiscalYear | sourceSha256 |
 * pipelineVersion). Same input file for the same FY and pipeline version can
 * never create a second batch.
 */
export function computeIdempotencyKey(input: {
  companyId: string;
  fiscalYearId: string;
  sourceSha256: string;
  pipelineVersion: string;
}): string {
  return sha256Hex(
    [input.companyId, input.fiscalYearId, input.sourceSha256, input.pipelineVersion].join("|"),
  );
}

/**
 * Row-level line hash: stable across re-imports of identical bytes (row
 * numbers are deterministic for the same file). Includes rowNo so two
 * byte-identical rows within one file stay two staging rows — content-level
 * duplication is handled by the duplicate-detection stage and the unique
 * content-hash indexes, not by collapsing rows. Anchors the unique
 * (batch, source_line_hash) constraint.
 */
export function computeLineHash(record: SourceRecord): string {
  return sha256Hex(
    canonicalJson({ rowNo: record.rowNo, fields: record.fields, lines: record.lines ?? [] }),
  );
}

/**
 * Financial content hash: anchors duplicate detection and the per-FY unique
 * content indexes on documents/journal entries. Covers only business fields
 * (never row numbers), so re-imports of the same content collide by design.
 */
export function computeContentHash(normalized: NormalizedRecord): string {
  return sha256Hex(
    canonicalJson({
      kind: normalized.kind,
      date: normalized.date,
      documentType: normalized.documentType ?? null,
      documentNo: normalized.documentNo ?? null,
      amount: normalized.amount,
      currency: normalized.currency,
      counterpartyName: normalized.counterpartyName ?? null,
      referenceNo: normalized.referenceNo ?? null,
      memo: normalized.memo ?? null,
      lines: normalized.lines ?? null,
    }),
  );
}
