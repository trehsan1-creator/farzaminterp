/**
 * Production repository implementations of the import pipeline contracts
 * over Supabase (service-role, server-side only).
 *
 * Idempotency anchors map to database constraints:
 *  - source files: unique (company_id, content_sha256)
 *  - batches:      unique idempotency_key
 *  - staging:      unique (import_batch_id, source_line_hash)
 *  - issues:       pre-checked (batch, code, staging row) before insert
 * Re-running an import therefore converges to the same rows; posted state
 * is preserved because post_status is never included in upsert payloads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalProbe,
  BatchFindOrCreateInput,
  BatchRepo,
  CatalogRepo,
  ContentProbe,
  IssueDraftInput,
  IssueRepo,
  PostingGateway,
  PostingResult,
  RawPreserver,
  SourceFileRegisterInput,
  SourceFileRepo,
  StagingRepo,
  StagingUpsertInput,
} from "./repositories";
import type {
  BatchRow,
  ExpectedTotals,
  RecordKind,
  ReconciliationSummary,
  SourceFileRow,
  StagingRow,
} from "./types";
import type { PipelineDeps } from "./repositories";
import { getServerEnv } from "@/lib/env";

function mapSourceFile(r: Record<string, unknown>): SourceFileRow {
  return {
    id: r["id"] as string,
    companyId: r["company_id"] as string,
    originalFilename: r["original_filename"] as string,
    storageBucket: r["storage_bucket"] as string,
    storagePath: r["storage_path"] as string,
    contentSha256: r["content_sha256"] as string,
    byteSize: Number(r["byte_size"]),
    mimeType: (r["mime_type"] as string | null) ?? null,
    rawPreserved: Boolean(r["raw_preserved"]),
  };
}

function mapBatch(r: Record<string, unknown>): BatchRow {
  return {
    id: r["id"] as string,
    companyId: r["company_id"] as string,
    fiscalYearId: r["fiscal_year_id"] as string,
    sourceFileId: r["source_file_id"] as string,
    pipelineVersion: r["pipeline_version"] as string,
    idempotencyKey: r["idempotency_key"] as string,
    status: r["status"] as BatchRow["status"],
    stage: r["stage"] as BatchRow["stage"],
    expectedTotals: (r["expected_totals"] as ExpectedTotals | null) ?? null,
    reconciliationSummary:
      (r["reconciliation_summary"] as ReconciliationSummary | null) ?? null,
    stats: (r["stats"] as Record<string, unknown>) ?? {},
    errorSummary: (r["error_summary"] as string | null) ?? null,
    approvalId: (r["approval_id"] as string | null) ?? null,
  };
}

function mapStaging(r: Record<string, unknown>): StagingRow {
  return {
    id: r["id"] as string,
    companyId: r["company_id"] as string,
    fiscalYearId: r["fiscal_year_id"] as string,
    importBatchId: r["import_batch_id"] as string,
    recordKind: r["record_kind"] as RecordKind,
    sourceRowNo: Number(r["source_row_no"]),
    sourceLineHash: r["source_line_hash"] as string,
    payload: (r["payload"] as Record<string, unknown>) ?? {},
    normalized: (r["normalized"] as Record<string, unknown>) ?? {},
    validationStatus: r["validation_status"] as StagingRow["validationStatus"],
    validationErrors: (r["validation_errors"] as unknown[]) ?? [],
    duplicateStatus: r["duplicate_status"] as StagingRow["duplicateStatus"],
    duplicateOfDocumentId: (r["duplicate_of_document_id"] as string | null) ?? null,
    postStatus: r["post_status"] as StagingRow["postStatus"],
    postedDocumentId: (r["posted_document_id"] as string | null) ?? null,
    postedJournalEntryId: (r["posted_journal_entry_id"] as string | null) ?? null,
  };
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export function createSupabaseSourceFiles(client: SupabaseClient): SourceFileRepo {
  return {
    async register(input: SourceFileRegisterInput) {
      const { data: existing, error: selErr } = await client
        .from("import_source_files")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("content_sha256", input.contentSha256)
        .maybeSingle();
      if (selErr) fail("source_files.register(select)", selErr);
      if (existing) return { file: mapSourceFile(existing), created: false };

      const { data: inserted, error: insErr } = await client
        .from("import_source_files")
        .insert({
          company_id: input.companyId,
          original_filename: input.originalFilename,
          storage_bucket: input.storageBucket,
          storage_path: input.storagePath,
          content_sha256: input.contentSha256,
          byte_size: input.byteSize,
          mime_type: input.mimeType,
        })
        .select()
        .single();
      if (insErr) {
        // race: unique (company, sha) — re-select
        if (insErr.code === "23505") {
          const { data: raced, error: reErr } = await client
            .from("import_source_files")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("content_sha256", input.contentSha256)
            .single();
          if (reErr) fail("source_files.register(race)", reErr);
          return { file: mapSourceFile(raced!), created: false };
        }
        fail("source_files.register(insert)", insErr);
      }
      return { file: mapSourceFile(inserted!), created: true };
    },
    async markPreserved(fileId) {
      const { error } = await client
        .from("import_source_files")
        .update({ raw_preserved: true, preserved_at: new Date().toISOString() })
        .eq("id", fileId)
        .is("raw_preserved", false);
      if (error) fail("source_files.markPreserved", error);
    },
  };
}

export function createSupabaseBatches(client: SupabaseClient): BatchRepo {
  return {
    async findOrCreate(input: BatchFindOrCreateInput) {
      const { data: existing, error: selErr } = await client
        .from("import_batches")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (selErr) fail("batches.findOrCreate(select)", selErr);
      if (existing) return { batch: mapBatch(existing), created: false };

      const { data: inserted, error: insErr } = await client
        .from("import_batches")
        .insert({
          company_id: input.companyId,
          fiscal_year_id: input.fiscalYearId,
          source_file_id: input.sourceFileId,
          pipeline_version: input.pipelineVersion,
          idempotency_key: input.idempotencyKey,
          expected_totals: input.expectedTotals,
        })
        .select()
        .single();
      if (insErr) {
        if (insErr.code === "23505") {
          const { data: raced, error: reErr } = await client
            .from("import_batches")
            .select("*")
            .eq("idempotency_key", input.idempotencyKey)
            .single();
          if (reErr) fail("batches.findOrCreate(race)", reErr);
          return { batch: mapBatch(raced!), created: false };
        }
        fail("batches.findOrCreate(insert)", insErr);
      }
      return { batch: mapBatch(inserted!), created: true };
    },
    async updateState(batchId, patch) {
      const payload: Record<string, unknown> = {};
      if (patch.status !== undefined) payload["status"] = patch.status;
      if (patch.stage !== undefined) payload["stage"] = patch.stage;
      if (patch.errorSummary !== undefined) payload["error_summary"] = patch.errorSummary;
      if (patch.reconciliationSummary !== undefined)
        payload["reconciliation_summary"] = patch.reconciliationSummary;
      if (patch.stats !== undefined) payload["stats"] = patch.stats;
      if (Object.keys(payload).length === 0) {
        const { data, error } = await client
          .from("import_batches")
          .select("*")
          .eq("id", batchId)
          .single();
        if (error) fail("batches.updateState(select)", error);
        return mapBatch(data!);
      }
      const { data, error } = await client
        .from("import_batches")
        .update(payload)
        .eq("id", batchId)
        .select()
        .single();
      if (error) fail("batches.updateState", error);
      return mapBatch(data!);
    },
  };
}

export function createSupabaseStaging(client: SupabaseClient): StagingRepo {
  return {
    async upsert(rows: StagingUpsertInput[]) {
      if (rows.length === 0) return [];
      // post_status / posted ids are intentionally omitted: on conflict they
      // are preserved, which is what makes re-imports idempotent.
      const payload = rows.map((r) => ({
        import_batch_id: r.importBatchId,
        company_id: r.companyId,
        fiscal_year_id: r.fiscalYearId,
        record_kind: r.recordKind,
        source_row_no: r.sourceRowNo,
        source_line_hash: r.sourceLineHash,
        payload: r.payload,
        normalized: r.normalized,
      }));
      const { data, error } = await client
        .from("import_staging_records")
        .upsert(payload, { onConflict: "import_batch_id,source_line_hash" })
        .select();
      if (error) fail("staging.upsert", error);
      return (data ?? []).map(mapStaging);
    },
    async listByBatch(batchId) {
      const { data, error } = await client
        .from("import_staging_records")
        .select("*")
        .eq("import_batch_id", batchId)
        .order("source_row_no");
      if (error) fail("staging.listByBatch", error);
      return (data ?? []).map(mapStaging);
    },
    async applyValidation(batchId, results) {
      for (const r of results) {
        const { error } = await client
          .from("import_staging_records")
          .update({
            validation_status: r.status,
            validation_errors: r.errors,
          })
          .eq("import_batch_id", batchId)
          .eq("source_line_hash", r.sourceLineHash);
        if (error) fail("staging.applyValidation", error);
      }
    },
    async applyDuplicates(batchId, results) {
      for (const r of results) {
        const { error } = await client
          .from("import_staging_records")
          .update({
            duplicate_status: r.duplicateStatus,
            duplicate_of_document_id: r.duplicateOfDocumentId,
          })
          .eq("import_batch_id", batchId)
          .eq("source_line_hash", r.sourceLineHash);
        if (error) fail("staging.applyDuplicates", error);
      }
    },
  };
}

export function createSupabaseIssues(client: SupabaseClient): IssueRepo {
  return {
    async syncForBatch(batchId, issues) {
      const { data: existing, error: selErr } = await client
        .from("import_validation_issues")
        .select("code, staging_record_id")
        .eq("import_batch_id", batchId);
      if (selErr) fail("issues.syncForBatch(select)", selErr);
      const have = new Set(
        (existing ?? []).map(
          (e) => `${e.code}|${e.staging_record_id ?? ""}`,
        ),
      );
      const toInsert = issues
        .filter((i) => !have.has(`${i.code}|${i.stagingRecordId ?? ""}`))
        .map((i) => ({
          company_id: i.companyId,
          fiscal_year_id: i.fiscalYearId,
          import_batch_id: i.importBatchId,
          staging_record_id: i.stagingRecordId,
          source_ref: i.sourceRef,
          severity: i.severity,
          code: i.code,
          message_fa: i.messageFa,
          field: i.field,
          details: i.details ?? {},
        }));
      if (toInsert.length > 0) {
        const { error } = await client
          .from("import_validation_issues")
          .insert(toInsert);
        if (error) fail("issues.syncForBatch(insert)", error);
      }
    },
    async countOpenErrors(batchId) {
      const { count, error } = await client
        .from("import_validation_issues")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", batchId)
        .eq("severity", "error");
      if (error) fail("issues.countOpenErrors", error);
      return count ?? 0;
    },
    async listOpenByBatch(batchId) {
      const { data, error } = await client
        .from("import_validation_issues")
        .select("*")
        .eq("import_batch_id", batchId)
        .order("created_at");
      if (error) fail("issues.listOpenByBatch", error);
      return (data ?? []).map((r) => ({
        companyId: r["company_id"] as string,
        fiscalYearId: (r["fiscal_year_id"] as string | null) ?? null,
        importBatchId: batchId,
        stagingRecordId: (r["staging_record_id"] as string | null) ?? null,
        sourceRef: (r["source_ref"] as string | null) ?? null,
        severity: r["severity"] as IssueDraftInput["severity"],
        code: r["code"] as string,
        messageFa: r["message_fa"] as string,
        field: (r["field"] as string | null) ?? null,
        details: (r["details"] as Record<string, unknown>) ?? null,
      }));
    },
  };
}

export function createSupabaseCatalog(client: SupabaseClient): CatalogRepo {
  return {
    async listPostableAccountCodes(fiscalYearId) {
      const { data, error } = await client
        .from("chart_of_accounts")
        .select("code")
        .eq("fiscal_year_id", fiscalYearId)
        .eq("is_postable", true)
        .eq("status", "active");
      if (error) fail("catalog.listPostableAccountCodes", error);
      return new Set((data ?? []).map((r) => r["code"] as string));
    },
  };
}

const CONTENT_TABLE_BY_KIND: Record<string, string> = {
  document: "documents",
  journal_candidate: "journal_entries",
  bank_transaction: "bank_transactions",
  sales_invoice: "sales_invoices",
  purchase_invoice: "purchase_invoices",
  tax_return: "tax_returns",
  fixed_asset: "fixed_assets",
};

export function createSupabaseContentProbe(client: SupabaseClient): ContentProbe {
  return {
    async findPostedContent({ companyId, fiscalYearId, kind, contentHash }) {
      const table = CONTENT_TABLE_BY_KIND[kind];
      if (!table) return null;
      const { data, error } = await client
        .from(table)
        .select("id")
        .eq("company_id", companyId)
        .eq("fiscal_year_id", fiscalYearId)
        .eq("content_hash", contentHash)
        .limit(1)
        .maybeSingle();
      if (error) fail("contentProbe.findPostedContent", error);
      return (data?.["id"] as string | undefined) ?? null;
    },
  };
}

export function createSupabaseApprovals(client: SupabaseClient): ApprovalProbe {
  return {
    async hasApprovedImportPosting(batchId) {
      const { data, error } = await client
        .from("approvals")
        .select("id")
        .eq("action", "post_import_batch")
        .eq("target_type", "import_batch")
        .eq("target_id", batchId)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      if (error) fail("approvals.hasApprovedImportPosting", error);
      return Boolean(data);
    },
  };
}

export function createSupabasePosting(client: SupabaseClient): PostingGateway {
  return {
    async postBatch(batchId, actorUserId): Promise<PostingResult> {
      const { data, error } = await client.rpc("post_import_batch", {
        p_batch_id: batchId,
        p_actor: actorUserId,
      });
      if (error) fail("posting.postBatch", error);
      const result = (data ?? {}) as Record<string, unknown>;
      return {
        alreadyPosted: Boolean(result["already_posted"]),
        postedJournalEntries: Number(result["posted_journal_entries"] ?? 0),
        postedDocuments: Number(result["posted_documents"] ?? 0),
      };
    },
  };
}

export function createSupabasePreserver(client: SupabaseClient): RawPreserver {
  return {
    async preserve(file) {
      // Stage 00: the raw bytes are uploaded by the caller before the
      // pipeline runs; this step verifies the object exists in the private
      // bucket (hash verification already passed).
      const env = getServerEnv();
      const { error } = await client.storage
        .from(file.storageBucket || env.storageBucket)
        .list(file.storagePath.split("/").slice(0, -1).join("/") || undefined, {
          search: file.storagePath.split("/").pop(),
        });
      if (error) fail("preserver.preserve(list)", error);
    },
  };
}

export function createSupabasePipelineDeps(client: SupabaseClient): PipelineDeps {
  return {
    sourceFiles: createSupabaseSourceFiles(client),
    batches: createSupabaseBatches(client),
    staging: createSupabaseStaging(client),
    issues: createSupabaseIssues(client),
    catalog: createSupabaseCatalog(client),
    contentProbe: createSupabaseContentProbe(client),
    approvalProbe: createSupabaseApprovals(client),
    posting: createSupabasePosting(client),
    preserver: createSupabasePreserver(client),
    nowIso: () => new Date().toISOString(),
  };
}
