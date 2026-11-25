/**
 * Server-side query functions for the Stage 00 screens.
 *
 * Every query is explicitly scoped by company + fiscal year (never by
 * "today"). When Supabase is not configured, results carry
 * `unavailable: true` so screens render an honest setup/empty state —
 * never fabricated rows.
 */

import { getServiceClient } from "@/lib/supabase/server";
import { hasDatabaseConfig } from "@/lib/env";
import type {
  CompanyRow,
  DocumentRow,
  FiscalYearRow,
  ImportBatchRow,
  ImportSourceFileRow,
  ImportStagingRow,
  ImportValidationIssueRow,
} from "@/db/types";

export type QueryResult<T> =
  | { ok: true; unavailable: false; data: T }
  | { ok: false; unavailable: true; reason: "not_configured" | "error"; message?: string };

function unavailable(reason: "not_configured" | "error", message?: string): QueryResult<never> {
  return { ok: false, unavailable: true, reason, message };
}

export async function getCompany(): Promise<QueryResult<CompanyRow | null>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("companies")
    .select("*")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) {
    // Keep the dashboard's public state generic, but retain a safe server-side
    // diagnostic so connection/RLS/schema failures are distinguishable.
    console.error("[farzam-erp:database] companies.select failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return unavailable("error", error.message);
  }
  return { ok: true, unavailable: false, data };
}

export async function listFiscalYears(companyId: string): Promise<QueryResult<FiscalYearRow[]>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("fiscal_years")
    .select("*")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("[farzam-erp:database] fiscal_years.select failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return unavailable("error", error.message);
  }
  return { ok: true, unavailable: false, data: data ?? [] };
}

export interface DocumentListScope {
  companyId: string;
  fiscalYearId: string;
}

export async function listDocuments(
  scope: DocumentListScope,
  opts: { limit?: number } = {},
): Promise<QueryResult<DocumentRow[]>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("documents")
    .select("*")
    .eq("company_id", scope.companyId)
    .eq("fiscal_year_id", scope.fiscalYearId)
    .order("document_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data: data ?? [] };
}

export async function listImportBatches(
  scope: DocumentListScope,
): Promise<QueryResult<ImportBatchRow[]>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("import_batches")
    .select("*")
    .eq("company_id", scope.companyId)
    .eq("fiscal_year_id", scope.fiscalYearId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data: data ?? [] };
}

export async function getImportBatch(
  scope: DocumentListScope,
  batchId: string,
): Promise<QueryResult<ImportBatchRow | null>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("import_batches")
    .select("*")
    .eq("company_id", scope.companyId)
    .eq("fiscal_year_id", scope.fiscalYearId)
    .eq("id", batchId)
    .maybeSingle();
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data };
}

export async function getBatchSourceFile(fileId: string): Promise<QueryResult<ImportSourceFileRow | null>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("import_source_files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle();
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data };
}

export async function listStagingRecords(
  batchId: string,
  opts: { limit?: number } = {},
): Promise<QueryResult<ImportStagingRow[]>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const { data, error } = await client
    .from("import_staging_records")
    .select("*")
    .eq("import_batch_id", batchId)
    .order("source_row_no")
    .limit(opts.limit ?? 200);
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data: data ?? [] };
}

export interface IssueScope {
  companyId: string;
  fiscalYearId: string | null;
  status?: string;
}

export async function listValidationIssues(
  scope: IssueScope,
): Promise<QueryResult<ImportValidationIssueRow[]>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  let query = client
    .from("import_validation_issues")
    .select("*")
    .eq("company_id", scope.companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (scope.fiscalYearId) query = query.eq("fiscal_year_id", scope.fiscalYearId);
  if (scope.status) query = query.eq("status", scope.status);
  const { data, error } = await query;
  if (error) return unavailable("error", error.message);
  return { ok: true, unavailable: false, data: data ?? [] };
}

export interface DashboardCounts {
  documents: number;
  importBatches: number;
  openIssues: number;
  readyBatches: number;
}

/** KPI counts — always 0 when there is genuinely no data (never faked). */
export async function getDashboardCounts(
  scope: DocumentListScope,
): Promise<QueryResult<DashboardCounts>> {
  if (!hasDatabaseConfig()) return unavailable("not_configured");
  const client = getServiceClient();
  if (!client) return unavailable("not_configured");
  const [docs, batches, issues, ready] = await Promise.all([
    client
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scope.companyId)
      .eq("fiscal_year_id", scope.fiscalYearId),
    client
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scope.companyId)
      .eq("fiscal_year_id", scope.fiscalYearId),
    client
      .from("import_validation_issues")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scope.companyId)
      .eq("fiscal_year_id", scope.fiscalYearId)
      .eq("severity", "error")
      .eq("status", "open"),
    client
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scope.companyId)
      .eq("fiscal_year_id", scope.fiscalYearId)
      .eq("status", "ready_to_post"),
  ]);
  const firstError = [docs, batches, issues, ready].find((r) => r.error)?.error;
  if (firstError) return unavailable("error", firstError.message);
  return {
    ok: true,
    unavailable: false,
    data: {
      documents: docs.count ?? 0,
      importBatches: batches.count ?? 0,
      openIssues: issues.count ?? 0,
      readyBatches: ready.count ?? 0,
    },
  };
}
