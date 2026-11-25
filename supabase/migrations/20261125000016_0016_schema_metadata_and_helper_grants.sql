-- 0016 — Schema metadata reconciliation and trigger-helper permissions.
-- Makes the live schema reproducible on a clean database and repairs helper
-- grants narrowed by 0014. No financial rows are inserted or posted.

alter table public.import_source_files
  add column if not exists source_location text not null default 'supabase_storage',
  add column if not exists external_reference text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.import_source_files'::regclass
      and conname='import_source_files_source_location_check'
  ) then
    alter table public.import_source_files
      add constraint import_source_files_source_location_check
      check (source_location in ('supabase_storage','external_reference'));
  end if;
end;
$$;

alter table public.companies
  add column if not exists legal_name_fa text,
  add column if not exists national_id text,
  add column if not exists economic_code text,
  add column if not exists tax_office text;

alter table public.chart_of_accounts
  add column if not exists approval_status text not null default 'pending',
  add column if not exists source_note text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.chart_of_accounts'::regclass
      and conname='chart_of_accounts_approval_status_check'
  ) then
    alter table public.chart_of_accounts
      add constraint chart_of_accounts_approval_status_check
      check (approval_status in ('pending','approved','rejected','demo'));
  end if;
end;
$$;

alter table public.counterparties
  add column if not exists source_system text,
  add column if not exists source_external_id text,
  add column if not exists legacy_kind text,
  add column if not exists data_quality_status text not null default 'verified',
  add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.counterparties'::regclass
      and conname='counterparties_data_quality_status_check'
  ) then
    alter table public.counterparties
      add constraint counterparties_data_quality_status_check
      check (data_quality_status in ('verified','needs_review','unverified','conflict','demo'));
  end if;
end;
$$;
create unique index if not exists uq_counterparties_source_ref
  on public.counterparties(company_id,source_system,source_external_id)
  where source_system is not null and source_external_id is not null;

alter table public.bank_accounts
  add column if not exists source_system text,
  add column if not exists source_external_id text,
  add column if not exists data_quality_status text not null default 'verified';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.bank_accounts'::regclass
      and conname='bank_accounts_data_quality_status_check'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_data_quality_status_check
      check (data_quality_status in ('verified','needs_review','unverified','conflict','demo'));
  end if;
end;
$$;
create unique index if not exists uq_bank_accounts_source_ref
  on public.bank_accounts(company_id,source_system,source_external_id)
  where source_system is not null and source_external_id is not null;

alter table public.bank_transactions
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

alter table public.fixed_assets
  add column if not exists source_system text,
  add column if not exists source_external_id text,
  add column if not exists data_quality_status text not null default 'verified',
  add column if not exists source_payload jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.fixed_assets'::regclass
      and conname='fixed_assets_data_quality_status_check'
  ) then
    alter table public.fixed_assets
      add constraint fixed_assets_data_quality_status_check
      check (data_quality_status in ('verified','needs_review','unverified','conflict','demo'));
  end if;
end;
$$;

alter table public.tax_returns
  add column if not exists submission_evidence_status text not null default 'not_provided',
  add column if not exists source_note text,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tax_returns'::regclass
      and conname='tax_returns_submission_evidence_status_check'
  ) then
    alter table public.tax_returns
      add constraint tax_returns_submission_evidence_status_check
      check (submission_evidence_status in ('not_provided','provided','verified'));
  end if;
end;
$$;

-- Trigger guard helpers are SECURITY DEFINER but reveal no sensitive data.
-- Authenticated users need EXECUTE because ordinary trigger functions invoke
-- them as the caller when inserting/updating scoped business records.
grant execute on function public.fz_assert_fy_scope(uuid,uuid) to authenticated,service_role;
grant execute on function public.fz_assert_date_in_fy(uuid,date) to authenticated,service_role;

-- Posting/reversal/import RPCs intentionally remain server-role-only.
revoke execute on function public.post_journal_entry(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.reverse_journal_entry(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.post_import_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.post_journal_entry(uuid,uuid) to service_role;
grant execute on function public.reverse_journal_entry(uuid,text,uuid) to service_role;
grant execute on function public.post_import_batch(uuid,uuid) to service_role;
