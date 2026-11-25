-- ============================================================================
-- 0010 — Row Level Security: enable + policies for every business table
-- Farzam ERP / Stage 00
--
-- Authorization model (see docs/MIGRATIONS.md):
--   viewer     : SELECT only, within member companies.
--   importer   : SELECT + INSERT/UPDATE on import pipeline tables and
--                document registration (staging workflow).
--   accountant : SELECT + INSERT/UPDATE on accounting/financial tables;
--                may delete draft journal lines only (DB trigger still
--                forbids touching posted/reversed lines).
--   owner      : all of the above + member management + approval decisions
--                + fiscal-year status changes (close remains approval-gated).
--
-- No DELETE policies exist in Stage 00 for financial tables: posted and
-- approved records are never deleted through ordinary flows; corrections use
-- reversal/void semantics. Service-role (server-side) bypasses RLS for
-- controlled pipelines; the browser never holds privileged keys.
--
-- RLS is not FORCEd: the table owner (postgres / SQL editor) retains access
-- for administration; every non-privileged role is covered by policies.
-- ============================================================================

create or replace function fz_is_company_member(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members m
    where m.company_id = p_company_id and m.user_id = auth.uid()
  );
$$;

create or replace function fz_has_role(p_company_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role::text = any (p_roles)
  );
$$;

revoke all on function fz_is_company_member(uuid) from public;
revoke all on function fz_has_role(uuid, text[]) from public;
grant execute on function fz_is_company_member(uuid) to authenticated;
grant execute on function fz_has_role(uuid, text[]) to authenticated;

-- Enable RLS on every business table (literal, reviewable statements).
alter table companies enable row level security;
alter table company_members enable row level security;
alter table fiscal_years enable row level security;
alter table fiscal_periods enable row level security;
alter table chart_of_accounts enable row level security;
alter table counterparties enable row level security;
alter table bank_accounts enable row level security;
alter table import_source_files enable row level security;
alter table import_batches enable row level security;
alter table import_staging_records enable row level security;
alter table import_validation_issues enable row level security;
alter table documents enable row level security;
alter table bank_transactions enable row level security;
alter table sales_invoices enable row level security;
alter table purchase_invoices enable row level security;
alter table tax_returns enable row level security;
alter table fixed_assets enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table reconciliation_items enable row level security;
alter table approvals enable row level security;
alter table audit_events enable row level security;

do $$
declare
  t text;
  -- Tables carrying a company_id column (journal_entry_lines handled apart).
  std_tables text[] := array[
    'companies', 'company_members', 'fiscal_years', 'fiscal_periods',
    'chart_of_accounts', 'counterparties', 'bank_accounts',
    'import_source_files', 'import_batches', 'import_staging_records',
    'import_validation_issues', 'documents',
    'bank_transactions', 'sales_invoices', 'purchase_invoices',
    'tax_returns', 'fixed_assets',
    'journal_entries',
    'reconciliation_items', 'approvals', 'audit_events'
  ];
  -- Tables where importer may write (import staging workflow).
  import_tables text[] := array[
    'import_source_files', 'import_batches', 'import_staging_records',
    'import_validation_issues', 'documents'
  ];
begin
  foreach t in array std_tables loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);

    if t = 'companies' then
      -- SELECT: members only. Creation/updates are service-side in Stage 00.
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(id))
      $p$, t, t);

    elsif t = 'company_members' then
      execute format($p$
        create policy %I_select on %I for select
        using (user_id = auth.uid() or fz_has_role(company_id, array['owner']))
      $p$, t, t);
      execute format($p$
        create policy %I_insert on %I for insert
        with check (user_id = auth.uid() or fz_has_role(company_id, array['owner']))
      $p$, t, t);
      execute format($p$
        create policy %I_update on %I for update
        using (fz_has_role(company_id, array['owner']))
        with check (fz_has_role(company_id, array['owner']))
      $p$, t, t);

    elsif t = 'fiscal_years' then
      -- lifecycle changes are owner-only; closing stays approval-gated in DB
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(company_id))
      $p$, t, t);
      execute format($p$
        create policy %I_update on %I for update
        using (fz_has_role(company_id, array['owner']))
        with check (fz_has_role(company_id, array['owner']))
      $p$, t, t);

    elsif t = 'approvals' then
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(company_id))
      $p$, t, t);
      execute format($p$
        create policy %I_insert on %I for insert
        with check (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant'])
        )
      $p$, t, t);
      -- approval decisions are owner-only
      execute format($p$
        create policy %I_update on %I for update
        using (fz_has_role(company_id, array['owner']))
        with check (fz_has_role(company_id, array['owner']))
      $p$, t, t);

    elsif t = 'audit_events' then
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(company_id))
      $p$, t, t);
      -- append-only table: inserts allowed for members with write roles;
      -- updates/deletes are rejected by trigger regardless.
      execute format($p$
        create policy %I_insert on %I for insert
        with check (
          company_id is not null
          and fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant','importer'])
        )
      $p$, t, t);

    elsif t = any (import_tables) then
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(company_id))
      $p$, t, t);
      execute format($p$
        create policy %I_insert on %I for insert
        with check (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant','importer'])
        )
      $p$, t, t);
      execute format($p$
        create policy %I_update on %I for update
        using (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant','importer'])
        )
        with check (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant','importer'])
        )
      $p$, t, t);

    else
      -- standard member-select, accountant/owner-write tables
      execute format($p$
        create policy %I_select on %I for select
        using (fz_is_company_member(company_id))
      $p$, t, t);
      execute format($p$
        create policy %I_insert on %I for insert
        with check (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant'])
        )
      $p$, t, t);
      execute format($p$
        create policy %I_update on %I for update
        using (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant'])
        )
        with check (
          fz_is_company_member(company_id)
          and fz_has_role(company_id, array['owner','accountant'])
        )
      $p$, t, t);
    end if;
  end loop;

  -- journal_entry_lines: no company_id; scope via parent journal entry.
  execute 'alter table journal_entry_lines enable row level security';
  execute $p$
    drop policy if exists journal_entry_lines_select on journal_entry_lines;
    drop policy if exists journal_entry_lines_insert on journal_entry_lines;
    drop policy if exists journal_entry_lines_update on journal_entry_lines;
    drop policy if exists journal_entry_lines_delete on journal_entry_lines;
    create policy journal_entry_lines_select on journal_entry_lines for select
      using (
        exists (
          select 1 from journal_entries je
          where je.id = journal_entry_lines.journal_entry_id
            and fz_is_company_member(je.company_id)
        )
      );
    create policy journal_entry_lines_insert on journal_entry_lines for insert
      with check (
        exists (
          select 1 from journal_entries je
          where je.id = journal_entry_lines.journal_entry_id
            and fz_is_company_member(je.company_id)
            and fz_has_role(je.company_id, array['owner','accountant'])
            and je.status = 'draft'
        )
      );
    create policy journal_entry_lines_update on journal_entry_lines for update
      using (
        exists (
          select 1 from journal_entries je
          where je.id = journal_entry_lines.journal_entry_id
            and fz_is_company_member(je.company_id)
            and fz_has_role(je.company_id, array['owner','accountant'])
            and je.status = 'draft'
        )
      );
    create policy journal_entry_lines_delete on journal_entry_lines for delete
      using (
        exists (
          select 1 from journal_entries je
          where je.id = journal_entry_lines.journal_entry_id
            and fz_is_company_member(je.company_id)
            and fz_has_role(je.company_id, array['owner','accountant'])
            and je.status = 'draft'
        )
      );
  $p$;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase default privileges already grant to authenticated and
-- service_role; anon is explicitly denied all data access.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
