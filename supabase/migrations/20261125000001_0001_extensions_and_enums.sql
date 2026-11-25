-- ============================================================================
-- 0001 — Foundations: extensions, conventions, shared enums
-- Farzam ERP / Stage 00
--
-- Conventions (repository-wide, also documented in docs/MIGRATIONS.md):
--   * Money: NUMERIC(20,0) only — exact integer amounts in the record's
--     explicit currency (Rial "IRR" or Toman "IRT"). Never float/real/money.
--     No column ever infers a unit from magnitude.
--   * Dates: canonical storage is the Gregorian ISO `date`. Jalali/Shamsi is a
--     display concern computed in the application (src/lib/jalali.ts).
--     Source-date text from imports is preserved verbatim in import payloads.
--   * Identity: UUID primary keys (gen_random_uuid()).
--   * Every financial row carries company_id + fiscal_year_id where applicable.
--   * Provenance: import-sourced rows reference import_batch_id and, where
--     applicable, import_source_files / import_staging_records.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared enumerations (constrained via CHECK-friendly text domains kept as
-- enums for discoverability; new values require a reviewed migration).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fz_company_status') then
    create type fz_company_status as enum ('active', 'inactive');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_fiscal_year_status') then
    -- 'closed' is reachable only through the approval-gated close routine.
    create type fz_fiscal_year_status as enum ('open', 'locked', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_period_status') then
    create type fz_period_status as enum ('open', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_account_type') then
    create type fz_account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_side') then
    create type fz_side as enum ('debit', 'credit');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_document_type') then
    create type fz_document_type as enum
      ('journal', 'sales_invoice', 'purchase_invoice', 'bank_transaction',
       'tax_return', 'fixed_asset', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_document_status') then
    create type fz_document_status as enum
      ('registered', 'staged', 'validated', 'on_hold', 'posted', 'void');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_import_status') then
    create type fz_import_status as enum
      ('created', 'running', 'ready_to_post', 'posting', 'posted', 'failed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_import_stage') then
    create type fz_import_stage as enum
      ('source_registered', 'hash_verified', 'raw_preserved', 'normalized',
       'validated', 'duplicates_detected', 'reconciled', 'posting', 'posted');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_validation_status') then
    create type fz_validation_status as enum ('pending', 'valid', 'invalid');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_duplicate_status') then
    create type fz_duplicate_status as enum ('unknown', 'unique', 'duplicate');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_post_status') then
    create type fz_post_status as enum ('pending', 'posted', 'skipped', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_issue_severity') then
    create type fz_issue_severity as enum ('error', 'warning', 'info');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_issue_status') then
    create type fz_issue_status as enum ('open', 'acknowledged', 'resolved', 'ignored');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_journal_status') then
    -- draft -> posted; posted -> reversed (controlled reversal only).
    create type fz_journal_status as enum ('draft', 'posted', 'reversed');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_approval_status') then
    create type fz_approval_status as enum ('pending', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_approval_action') then
    create type fz_approval_action as enum
      ('post_import_batch', 'post_journal_entry', 'close_fiscal_year',
       'reverse_journal_entry', 'amend_document');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_actor_type') then
    create type fz_actor_type as enum ('user', 'agent', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_reconciliation_status') then
    create type fz_reconciliation_status as enum ('open', 'matched', 'disputed', 'resolved');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_member_role') then
    create type fz_member_role as enum ('owner', 'accountant', 'importer', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_counterparty_kind') then
    create type fz_counterparty_kind as enum
      ('customer', 'supplier', 'bank', 'employee', 'tax_authority', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_txn_direction') then
    create type fz_txn_direction as enum ('in', 'out');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_invoice_status') then
    create type fz_invoice_status as enum ('draft', 'staged', 'posted', 'void');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_tax_return_status') then
    create type fz_tax_return_status as enum ('draft', 'filed', 'amended');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_asset_status') then
    create type fz_asset_status as enum ('active', 'disposed');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_record_kind') then
    create type fz_record_kind as enum
      ('document', 'bank_transaction', 'sales_invoice', 'purchase_invoice',
       'journal_candidate', 'tax_return', 'fixed_asset');
  end if;
  if not exists (select 1 from pg_type where typname = 'fz_posting_status') then
    create type fz_posting_status as enum ('staged', 'posted', 'excluded');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

create or replace function fz_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function fz_touch_updated_at() is
  'Standard updated_at maintenance trigger function.';
