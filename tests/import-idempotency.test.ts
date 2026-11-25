import { describe, expect, it } from "vitest";
import {
  authorizeAndPost,
  runImportPipeline,
  type PipelineInput,
} from "@/modules/imports/pipeline";
import {
  createMemoryPipelineDeps,
  type MemoryPipelineDeps,
} from "@/modules/imports/memory-repositories";
import { computeIdempotencyKey, sha256Hex } from "@/modules/imports/hashing";
import { parseCsv } from "@/modules/imports/csv";
import { PipelineError } from "@/modules/imports/types";

const COMPANY = "company-1";
const FY = "fy-1404";

/** Test fixture CSV (in-memory only — never written to any real system). */
const FIXTURE_CSV = [
  "record_kind,date,amount,currency,document_type,document_no,description",
  "document,1404/01/15,12500000,ریال,sales_invoice,INV-1001,فاکتور آزمایشی ۱",
  "document,1404/01/16,25000000,ریال,sales_invoice,INV-1002,فاکتور آزمایشی ۲",
  "",
].join("\n");

function makeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    companyId: COMPANY,
    fiscalYearId: FY,
    fiscalYearStartDate: "2025-03-21",
    fiscalYearEndDate: "2026-03-20",
    originalFilename: "fixture-fy1404.csv",
    content: FIXTURE_CSV,
    storageBucket: "import-source",
    storagePath: `${FY}/fixture.csv`,
    mimeType: "text/csv",
    ...overrides,
  };
}

function deps(): MemoryPipelineDeps {
  return createMemoryPipelineDeps();
}

describe("import pipeline — idempotency", () => {
  it("registers the source file and creates a batch on first run", async () => {
    const d = deps();
    const report = await runImportPipeline(makeInput(), d);

    expect(report.batchCreated).toBe(true);
    expect(report.sourceFileCreated).toBe(true);
    expect(report.alreadyImported).toBe(false);
    expect(report.counts.records).toBe(2);
    expect(report.counts.valid).toBe(2);
    expect(report.counts.openErrors).toBe(0);
    expect(report.readyToPost).toBe(true);
    expect(report.batchStatus).toBe("ready_to_post");
    expect(d.store.sourceFiles.size).toBe(1);
    expect(d.store.batches.size).toBe(1);
    expect(d.store.staging.size).toBe(2);
  });

  it("re-importing identical bytes resolves to the SAME batch (no duplicates)", async () => {
    const d = deps();
    const first = await runImportPipeline(makeInput(), d);
    const second = await runImportPipeline(makeInput(), d);

    expect(second.batchCreated).toBe(false);
    expect(second.alreadyImported).toBe(true);
    expect(second.batchId).toBe(first.batchId);
    expect(second.sourceFileId).toBe(first.sourceFileId);
    expect(second.sourceFileCreated).toBe(false);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);

    // no growth anywhere
    expect(d.store.sourceFiles.size).toBe(1);
    expect(d.store.batches.size).toBe(1);
    expect(d.store.staging.size).toBe(2);
    expect(second.counts.records).toBe(2);
  });

  it("the idempotency key is deterministic and input-bound", () => {
    const base = {
      companyId: COMPANY,
      fiscalYearId: FY,
      sourceSha256: sha256Hex(FIXTURE_CSV),
      pipelineVersion: "fy1404-import@1",
    };
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base }));
    expect(computeIdempotencyKey({ ...base, fiscalYearId: "fy-1405" })).not.toBe(
      computeIdempotencyKey(base),
    );
    expect(computeIdempotencyKey({ ...base, sourceSha256: sha256Hex("other") })).not.toBe(
      computeIdempotencyKey(base),
    );
    expect(computeIdempotencyKey({ ...base, pipelineVersion: "v2" })).not.toBe(
      computeIdempotencyKey(base),
    );
  });

  it("different content creates a new source file and batch", async () => {
    const d = deps();
    await runImportPipeline(makeInput(), d);
    const other = makeInput({
      content: FIXTURE_CSV.replace("INV-1002", "INV-1003"),
      originalFilename: "fixture-fy1404-b.csv",
      storagePath: `${FY}/fixture-b.csv`,
    });
    const report = await runImportPipeline(other, d);
    expect(report.batchCreated).toBe(true);
    expect(d.store.sourceFiles.size).toBe(2);
    expect(d.store.batches.size).toBe(2);
  });

  it("a hash mismatch aborts before any write", async () => {
    const d = deps();
    await expect(
      runImportPipeline(makeInput({ declaredSha256: "a".repeat(64) }), d),
    ).rejects.toThrowError(PipelineError);
    expect(d.store.sourceFiles.size).toBe(0);
    expect(d.store.batches.size).toBe(0);
    expect(d.store.staging.size).toBe(0);
  });

  it("authorized posting is idempotent — financial records never duplicate", async () => {
    const d = deps();
    const report = await runImportPipeline(makeInput(), d);
    expect(d.store.approvals.has(report.batchId)).toBe(false);

    // posting without approval must fail
    await expect(
      authorizeAndPost({ batchId: report.batchId, actorUserId: "user-1" }, d),
    ).rejects.toThrowError(/APPROVAL_REQUIRED|approval/i);

    d.store.approvals.add(report.batchId);

    const post1 = await authorizeAndPost(
      { batchId: report.batchId, actorUserId: "user-1" },
      d,
    );
    expect(post1.alreadyPosted).toBe(false);
    expect(post1.postedDocuments).toBe(2);

    const rowsAfterFirst = [...d.store.staging.values()].map((r) => r.postedDocumentId);
    expect(rowsAfterFirst.every((id) => id !== null)).toBe(true);

    // second post: no-op, no new records
    const post2 = await authorizeAndPost(
      { batchId: report.batchId, actorUserId: "user-1" },
      d,
    );
    expect(post2.alreadyPosted).toBe(true);
    expect(post2.postedDocuments).toBe(0);
    const rowsAfterSecond = [...d.store.staging.values()].map((r) => r.postedDocumentId);
    expect(rowsAfterSecond).toEqual(rowsAfterFirst);

    // pipeline re-run after posting short-circuits and preserves state
    const rerun = await runImportPipeline(makeInput(), d);
    expect(rerun.batchStatus).toBe("posted");
    expect(rerun.alreadyImported).toBe(true);
    expect([...d.store.staging.values()].map((r) => r.postedDocumentId)).toEqual(
      rowsAfterFirst,
    );
    expect(d.store.batches.size).toBe(1);
  });

  it("flags within-batch duplicate rows and posts content only once", async () => {
    const d = deps();
    const dupCsv = [
      "record_kind,date,amount,currency,document_type,document_no,description",
      "document,1404/02/01,5000,ریال,other,DUP-1,ردیف تکراری",
      "document,1404/02/01,5000,ریال,other,DUP-1,ردیف تکراری",
      "",
    ].join("\n");
    const report = await runImportPipeline(makeInput({ content: dupCsv }), d);
    expect(report.counts.records).toBe(2);
    expect(report.counts.duplicates).toBe(1);
    // duplicate is a warning, not a blocking error
    expect(report.readyToPost).toBe(true);

    d.store.approvals.add(report.batchId);
    const post = await authorizeAndPost(
      { batchId: report.batchId, actorUserId: "user-1" },
      d,
    );
    expect(post.postedDocuments).toBe(1);
    const statuses = [...d.store.staging.values()].map((r) => r.postStatus).sort();
    expect(statuses).toEqual(["posted", "skipped"]);
  });

  it("detects content already posted for the fiscal year (re-import after posting elsewhere)", async () => {
    const d = deps();
    // pre-post one of the fixture documents outside this batch
    const rows = parseCsv(FIXTURE_CSV);
    const { normalizeSourceRecord } = await import("@/modules/imports/normalize");
    const firstNorm = normalizeSourceRecord(rows[0]!).normalized;
    const { computeContentHash } = await import("@/modules/imports/hashing");
    const existingId = "doc-existing";
    d.store.postedContent.set(
      `${COMPANY}|${FY}|document|${computeContentHash(firstNorm)}`,
      existingId,
    );

    const report = await runImportPipeline(makeInput(), d);
    expect(report.counts.duplicates).toBe(1);
    const dupRow = [...d.store.staging.values()].find(
      (r) => r.duplicateStatus === "duplicate",
    );
    expect(dupRow?.duplicateOfDocumentId).toBe(existingId);
    // still ready: duplicate warning does not block, posting skips it
    expect(report.readyToPost).toBe(true);
  });

  it("surfaces validation errors as blocking issues (never auto-fixes)", async () => {
    const d = deps();
    const badCsv = [
      "record_kind,date,amount,currency,document_type,document_no,description",
      "document,1404/01/15,12500000,,sales_invoice,INV-X,بدون واحد پول",
      "document,not-a-date,100,ریال,other,INV-Y,تاریخ خراب",
      "",
    ].join("\n");
    const report = await runImportPipeline(
      makeInput({ content: badCsv, declaredCurrency: null }),
      d,
    );
    expect(report.readyToPost).toBe(false);
    expect(report.batchStatus).toBe("failed");
    expect(report.counts.openErrors).toBeGreaterThan(0);
    expect(report.counts.invalid).toBe(2);

    const issues = await d.issues.listOpenByBatch(report.batchId);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("CURRENCY_MISSING");
    expect(codes).toContain("DATE_INVALID");

    // posting must refuse
    d.store.approvals.add(report.batchId);
    await expect(
      authorizeAndPost({ batchId: report.batchId, actorUserId: "user-1" }, d),
    ).rejects.toThrowError(PipelineError);
  });

  it("an operator-declared currency satisfies rows without a unit (explicit, not inferred)", async () => {
    const d = deps();
    const csv = [
      "record_kind,date,amount,document_type,document_no,description",
      "document,1404/03/01,7777,sales_invoice,INV-Z,بدون ستون واحد",
      "",
    ].join("\n");
    const report = await runImportPipeline(
      makeInput({ content: csv, declaredCurrency: "IRR" }),
      d,
    );
    expect(report.readyToPost).toBe(true);
    const row = [...d.store.staging.values()][0]!;
    expect((row.normalized as { currency?: string }).currency).toBe("IRR");
  });

  it("blocks posting when source totals do not reconcile", async () => {
    const d = deps();
    const report = await runImportPipeline(
      makeInput({
        expectedTotals: { rows: 2, totalAmount: "999999999", currency: "IRR" },
      }),
      d,
    );
    expect(report.readyToPost).toBe(false);
    expect(report.reconciliation?.status).toBe("mismatched");
    const issues = await d.issues.listOpenByBatch(report.batchId);
    expect(issues.map((i) => i.code)).toContain("IMPORT_TOTAL_MISMATCH");
  });

  it("marks reconciliation partial (never invents totals) when the source declares none", async () => {
    const d = deps();
    const report = await runImportPipeline(makeInput(), d);
    expect(report.reconciliation?.status).toBe("partial");
    const issues = await d.issues.listOpenByBatch(report.batchId);
    expect(issues.map((i) => i.code)).toContain("TOTALS_NOT_DECLARED");
    // partial is informational: batch may still be ready to post
    expect(report.readyToPost).toBe(true);
  });

  it("parses CSV rows with quotes and localized digits", () => {
    const csv = [
      'record_kind,date,amount,currency,document_type,description',
      'document,۱۴۰۴/۰۱/۰۱,"1,000,000",ریال,other,"شرح، دارای ویرگول"',
      "",
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fields["amount"]).toBe("1,000,000");
    expect(rows[0]!.fields["description"]).toBe("شرح، دارای ویرگول");
  });
});
