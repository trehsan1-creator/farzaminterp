import { describe, expect, it } from "vitest";
import type { DocumentRow, ImportBatchRow } from "@/db/types";
import { buildDashboardVisuals } from "@/modules/analytics/dashboard";

function document(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: "doc-1",
    company_id: "company-1",
    fiscal_year_id: "fy-1404",
    document_type: "journal",
    document_no: null,
    document_date: null,
    counterparty_id: null,
    description: null,
    currency: "IRR",
    amount_total: null,
    status: "registered",
    source: "manual",
    import_batch_id: null,
    import_source_file_id: null,
    content_hash: null,
    created_at: "2025-03-21T00:00:00Z",
    updated_at: "2025-03-21T00:00:00Z",
    ...overrides,
  };
}

function batch(status: string, id: string): ImportBatchRow {
  return {
    id,
    company_id: "company-1",
    fiscal_year_id: "fy-1404",
    source_file_id: "source-1",
    pipeline_version: "1",
    idempotency_key: id,
    status,
    stage: "validated",
    expected_totals: null,
    reconciliation_summary: null,
    stats: {},
    error_summary: null,
    approval_id: null,
    created_at: "2025-03-21T00:00:00Z",
    updated_at: "2025-03-21T00:00:00Z",
    posted_at: null,
  };
}

describe("dashboard analytics", () => {
  it("groups dated documents by Jalali month and ignores missing dates", () => {
    const result = buildDashboardVisuals(
      [
        document({ id: "1", document_date: "2025-03-21", document_type: "journal" }),
        document({ id: "2", document_date: "2025-04-20", document_type: "journal" }),
        document({ id: "3", document_date: "2025-04-21", document_type: "sales_invoice" }),
        document({ id: "4", document_date: null, document_type: "purchase_invoice" }),
      ],
      [],
    );

    expect(result.monthlyDocuments[0]).toEqual({ month: "فروردین", value: 2 });
    expect(result.monthlyDocuments[1]).toEqual({ month: "اردیبهشت", value: 1 });
    expect(result.datedDocuments).toBe(3);
    expect(result.monthlyDocuments).toHaveLength(12);
  });

  it("builds document-type composition from persisted rows", () => {
    const result = buildDashboardVisuals(
      [
        document({ id: "1", document_type: "journal" }),
        document({ id: "2", document_type: "journal" }),
        document({ id: "3", document_type: "sales_invoice" }),
      ],
      [],
    );

    expect(result.documentTypes).toEqual([
      { type: "journal", label: "سند دفتری", value: 2 },
      { type: "sales_invoice", label: "فاکتور فروش", value: 1 },
    ]);
  });

  it("groups import batches by their exact persisted status", () => {
    const result = buildDashboardVisuals(
      [],
      [
        batch("ready_to_post", "batch-1"),
        batch("ready_to_post", "batch-2"),
        batch("failed", "batch-3"),
      ],
    );

    expect(result.batchStatuses).toEqual([
      { status: "ready_to_post", label: "آماده انتشار", value: 2 },
      { status: "failed", label: "ناموفق", value: 1 },
    ]);
  });

  it("returns empty chart series when no records exist", () => {
    const result = buildDashboardVisuals([], []);
    expect(result.monthlyDocuments.every((item) => item.value === 0)).toBe(true);
    expect(result.documentTypes).toEqual([]);
    expect(result.batchStatuses).toEqual([]);
  });
});
