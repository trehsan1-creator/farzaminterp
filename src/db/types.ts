/**
 * Hand-maintained row types mirroring supabase/migrations (Stage 00).
 * TODO(owner): replace with `supabase gen types typescript` output once a
 * live project is connected, keeping generated types synchronized with
 * migrations (AGENTS.md §5).
 */

export type CompanyStatus = "active" | "inactive";
export type FiscalYearStatus = "open" | "locked" | "closed";
export type PeriodStatus = "open" | "closed";
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Side = "debit" | "credit";
export type CurrencyCode = "IRR" | "IRT";

export interface CompanyRow {
  id: string;
  code: string;
  name_fa: string;
  name_en: string | null;
  base_currency: CurrencyCode;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface FiscalYearRow {
  id: string;
  company_id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: FiscalYearStatus;
  is_reconstruction: boolean;
  created_at: string;
  updated_at: string;
}

export interface FiscalPeriodRow {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  period_no: number;
  label: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

export interface DocumentRow {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  document_type: string;
  document_no: string | null;
  document_date: string | null;
  counterparty_id: string | null;
  description: string | null;
  currency: CurrencyCode;
  amount_total: string | null;
  status: string;
  source: "manual" | "import";
  import_batch_id: string | null;
  import_source_file_id: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportBatchRow {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  source_file_id: string;
  pipeline_version: string;
  idempotency_key: string;
  status: string;
  stage: string;
  expected_totals: Record<string, unknown> | null;
  reconciliation_summary: Record<string, unknown> | null;
  stats: Record<string, unknown>;
  error_summary: string | null;
  approval_id: string | null;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
}

export interface ImportSourceFileRow {
  id: string;
  company_id: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  content_sha256: string;
  byte_size: number;
  mime_type: string | null;
  raw_preserved: boolean;
  registered_at: string;
}

export interface ImportStagingRow {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  import_batch_id: string;
  record_kind: string;
  source_row_no: number;
  source_line_hash: string;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
  validation_status: string;
  validation_errors: unknown[];
  duplicate_status: string;
  duplicate_of_document_id: string | null;
  post_status: string;
  posted_document_id: string | null;
  posted_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportValidationIssueRow {
  id: string;
  company_id: string;
  fiscal_year_id: string | null;
  import_batch_id: string | null;
  staging_record_id: string | null;
  source_ref: string | null;
  severity: "error" | "warning" | "info";
  code: string;
  message_fa: string;
  field: string | null;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
}
