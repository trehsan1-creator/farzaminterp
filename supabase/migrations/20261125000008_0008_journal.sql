-- ============================================================================
-- 0008 — Double-entry journal: entries, lines, balance & posting controls
-- Farzam ERP / Stage 00
--
-- Financial integrity enforced by the database:
--   * posted entries are balanced: per-currency sum(debits) = sum(credits),
--     at least two lines, integer amounts > 0 — validated before any status
--     change to 'posted' (trigger + post_journal_entry + import posting);
--   * posted/reversed entries are immutable: lines cannot be inserted,
--     updated or deleted; corrections happen via controlled reversal;
--   * entry dates must lie inside their fiscal year (fiscal isolation);
--   * drafts may be built up over multiple transactions; balance is required
--     at the posting gate, not at every intermediate commit;
--   * import posting (post_import_batch) requires an approved approval row
--     and is idempotent: re-posting a posted batch is a no-op.
-- Amounts are NUMERIC(20,0) with explicit currency — never float, never
-- inferred from magnitude.
-- ============================================================================

create table if not exists journal_entries (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid not null references fiscal_years(id) on delete restrict,
  fiscal_period_id    uuid references fiscal_periods(id) on delete restrict,
  entry_no            text,
  entry_date          date not null,
  source_type         text not null default 'manual'
                        check (source_type in ('manual', 'import', 'system')),
  source_document_id  uuid references documents(id) on delete restrict,
  import_batch_id     uuid references import_batches(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  reversal_of_id      uuid references journal_entries(id) on delete restrict,
  reversal_reason     text,
  memo                text,
  status              fz_journal_status not null default 'draft',
  -- idempotency anchor for imported entries (sha256 of canonical content)
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  posted_at           timestamptz,
  posted_by           uuid references auth.users(id) on delete set null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint journal_reversal_consistency check (
    (reversal_of_id is not null and reversal_reason is not null)
    or (reversal_of_id is null)
  ),
  constraint journal_import_consistency check (
    (source_type = 'import' and import_batch_id is not null)
    or (source_type <> 'import')
  )
);

comment on table journal_entries is
  'Double-entry journal headers. Draft -> posted (balanced, gated) -> reversed (controlled reversal only).';

create unique index if not exists uq_journal_entries_no_fy
  on journal_entries(fiscal_year_id, entry_no) where entry_no is not null;
create unique index if not exists uq_journal_entries_content_hash
  on journal_entries(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;
create index if not exists idx_journal_entries_registry
  on journal_entries(company_id, fiscal_year_id, entry_date desc);
create index if not exists idx_journal_entries_batch
  on journal_entries(import_batch_id);
create index if not exists idx_journal_entries_status
  on journal_entries(company_id, fiscal_year_id, status);

create trigger journal_entries_touch_updated_at
  before update on journal_entries
  for each row execute function fz_touch_updated_at();

create table if not exists journal_entry_lines (
  id                  uuid primary key default gen_random_uuid(),
  journal_entry_id    uuid not null references journal_entries(id) on delete cascade,
  line_no             int not null check (line_no > 0),
  account_id          uuid not null references chart_of_accounts(id) on delete restrict,
  side                fz_side not null,
  amount              numeric(20, 0) not null check (amount > 0),
  currency            char(3) not null default 'IRR'
                        check (currency in ('IRR', 'IRT')),
  description         text,
  counterparty_id     uuid references counterparties(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  created_at          timestamptz not null default now(),
  unique (journal_entry_id, line_no)
);

comment on column journal_entry_lines.amount is
  'Exact integer amount in the explicit currency column. NUMERIC(20,0); no floating-point values; never a mixed-currency net.';

create index if not exists idx_journal_lines_account
  on journal_entry_lines(account_id);

-- ---------------------------------------------------------------------------
-- Balance assertion: per-currency debits must equal credits; >= 2 lines.
-- ---------------------------------------------------------------------------
create or replace function fz_assert_entry_balanced(p_entry_id uuid)
returns void
language plpgsql stable
as $$
declare
  v_lines int;
  v_unbalanced int;
begin
  select count(*) into v_lines
  from journal_entry_lines where journal_entry_id = p_entry_id;

  if v_lines < 2 then
    raise exception 'ENTRY_TOO_FEW_LINES'
      using message = 'a journal entry requires at least two lines';
  end if;

  select count(*) into v_unbalanced
  from (
    select currency,
           coalesce(sum(amount) filter (where side = 'debit'), 0)  as d,
           coalesce(sum(amount) filter (where side = 'credit'), 0) as c
    from journal_entry_lines
    where journal_entry_id = p_entry_id
    group by currency
  ) s
  where s.d <> s.c;

  if v_unbalanced > 0 then
    raise exception 'ENTRY_UNBALANCED'
      using message = 'debits must equal credits for every currency of the entry';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scope gate: company/fiscal-year/date consistency on insert and update.
-- ---------------------------------------------------------------------------
create or replace function fz_assert_journal_entry_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.entry_date);
  if new.reversal_of_id is not null then
    if not exists (
      select 1 from journal_entries r
      where r.id = new.reversal_of_id
        and r.company_id = new.company_id
        and r.fiscal_year_id = new.fiscal_year_id
    ) then
      raise exception 'REVERSAL_TARGET_MISMATCH'
        using message = 'a reversal must reference an entry of the same company and fiscal year';
    end if;
  end if;
  return new;
end;
$$;

create trigger journal_entries_scope
  before insert or update on journal_entries
  for each row execute function fz_assert_journal_entry_scope();

-- ---------------------------------------------------------------------------
-- Status gate:
--   draft    -> posted   : balanced, fiscal year open, period open/derived;
--   posted   -> reversed : controlled reversal only, all else immutable;
--   posted   -> draft    : forbidden (no un-posting);
--   reversed -> anything : forbidden.
-- ---------------------------------------------------------------------------
create or replace function fz_assert_journal_entry_status() returns trigger
language plpgsql as $$
declare
  fy_status fz_fiscal_year_status;
  per record;
begin
  if old.status = 'reversed' then
    raise exception 'ENTRY_REVERSED_IMMUTABLE'
      using message = 'a reversed entry is immutable; post a new correcting entry instead';
  end if;

  if old.status = 'posted' then
    if new.status = 'reversed' then
      if new.reversal_reason is null or length(btrim(new.reversal_reason)) = 0 then
        raise exception 'REVERSAL_REASON_REQUIRED';
      end if;
      if new.company_id is distinct from old.company_id
         or new.fiscal_year_id is distinct from old.fiscal_year_id
         or new.entry_date is distinct from old.entry_date
         or new.content_hash is distinct from old.content_hash
         or new.source_type is distinct from old.source_type then
        raise exception 'ENTRY_POSTED_IMMUTABLE'
          using message = 'posted journal entries cannot be edited; use reversal';
      end if;
      return new;
    end if;
    if new.status = 'draft' then
      raise exception 'ENTRY_CANNOT_UNPOST'
        using message = 'posted entries cannot return to draft';
    end if;
    -- status stays 'posted': allow only updated_at-style no-op updates
    if new.company_id is distinct from old.company_id
       or new.fiscal_year_id is distinct from old.fiscal_year_id
       or new.entry_date is distinct from old.entry_date
       or new.entry_no is distinct from old.entry_no
       or new.memo is distinct from old.memo
       or new.content_hash is distinct from old.content_hash
       or new.source_type is distinct from old.source_type
       or new.import_batch_id is distinct from old.import_batch_id
       or new.reversal_of_id is distinct from old.reversal_of_id then
      raise exception 'ENTRY_POSTED_IMMUTABLE'
        using message = 'posted journal entries cannot be edited; use reversal';
    end if;
    return new;
  end if;

  -- old.status = 'draft'
  if new.status = 'reversed' then
    raise exception 'ENTRY_DRAFT_CANNOT_REVERSE'
      using message = 'only posted entries can be reversed';
  end if;

  if new.status = 'posted' then
    -- balance (hard requirement)
    perform fz_assert_entry_balanced(new.id);
    -- fiscal year must be open
    select status into fy_status from fiscal_years where id = new.fiscal_year_id;
    if fy_status <> 'open' then
      raise exception 'FY_NOT_OPEN'
        using message = 'journal entries can only be posted into an open fiscal year';
    end if;
    -- period: derive when absent; enforce openness when present
    if new.fiscal_period_id is null then
      select id, status into per
      from fiscal_periods
      where fiscal_year_id = new.fiscal_year_id
        and new.entry_date between start_date and end_date
      order by period_no
      limit 1;
      if found then
        if per.status <> 'open' then
          raise exception 'PERIOD_CLOSED'
            using message = 'the fiscal period containing the entry date is closed';
        end if;
        new.fiscal_period_id := per.id;
      end if;
    else
      select id, status into per
      from fiscal_periods
      where id = new.fiscal_period_id and fiscal_year_id = new.fiscal_year_id;
      if not found then
        raise exception 'PERIOD_FISCAL_YEAR_MISMATCH';
      end if;
      if per.status <> 'open' then
        raise exception 'PERIOD_CLOSED';
      end if;
    end if;
    new.posted_at := coalesce(new.posted_at, now());
  end if;

  return new;
end;
$$;

create trigger journal_entries_status_gate
  before update on journal_entries
  for each row execute function fz_assert_journal_entry_status();

-- ---------------------------------------------------------------------------
-- Line guards: posted/reversed entries are immutable; draft entries may be
-- edited (and deleted only while their parent is still a draft).
-- ---------------------------------------------------------------------------
create or replace function fz_assert_journal_line_guard() returns trigger
language plpgsql as $$
declare
  v_status fz_journal_status;
  v_parent uuid;
begin
  if tg_op = 'DELETE' then
    v_parent := old.journal_entry_id;
  else
    v_parent := new.journal_entry_id;
  end if;

  select status into v_status
  from journal_entries where id = v_parent;

  if not found then
    -- parent already deleted: this is a cascade cleanup of a (gated) entry
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'JOURNAL_ENTRY_NOT_FOUND';
  end if;

  if v_status in ('posted', 'reversed') then
    raise exception 'ENTRY_LINES_IMMUTABLE'
      using message = 'lines of posted or reversed entries cannot be changed; use a reversal entry';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger journal_entry_lines_guard
  before insert or update or delete on journal_entry_lines
  for each row execute function fz_assert_journal_line_guard();

-- ---------------------------------------------------------------------------
-- Controlled reversal: creates a new balanced draft with swapped sides and
-- marks the original 'reversed'. Never mutates posted line history.
-- ---------------------------------------------------------------------------
create or replace function reverse_journal_entry(
  p_entry_id uuid,
  p_reason text,
  p_actor uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  src record;
  v_new_id uuid;
  v_line record;
  v_no int;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'REVERSAL_REASON_REQUIRED';
  end if;

  select * into src from journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'ENTRY_NOT_FOUND';
  end if;
  if src.status = 'reversed' then
    raise exception 'ENTRY_ALREADY_REVERSED';
  end if;
  if src.status <> 'posted' then
    raise exception 'ENTRY_NOT_POSTED'
      using message = 'only posted entries can be reversed';
  end if;

  insert into journal_entries (
    company_id, fiscal_year_id, fiscal_period_id, entry_date, source_type,
    reversal_of_id, reversal_reason, memo, status, created_by
  ) values (
    src.company_id, src.fiscal_year_id, src.fiscal_period_id,
    src.entry_date, 'system',
    src.id, p_reason,
    'معکوس‌سازی سند ' || coalesce(src.entry_no, src.id::text),
    'draft', p_actor
  ) returning id into v_new_id;

  v_no := 1;
  for v_line in
    select * from journal_entry_lines
    where journal_entry_id = src.id
    order by line_no
  loop
    insert into journal_entry_lines (
      journal_entry_id, line_no, account_id, side, amount, currency,
      description, counterparty_id, staging_record_id
    ) values (
      v_new_id, v_no, v_line.account_id,
      case when v_line.side = 'debit' then 'credit'::fz_side else 'debit'::fz_side end,
      v_line.amount, v_line.currency,
      v_line.description, v_line.counterparty_id, v_line.staging_record_id
    );
    v_no := v_no + 1;
  end loop;

  update journal_entries
  set status = 'reversed', reversal_reason = p_reason
  where id = src.id;

  insert into audit_events (
    company_id, fiscal_year_id, actor_type, actor_id, action,
    target_type, target_id, severity, details
  ) values (
    src.company_id, src.fiscal_year_id, 'user', p_actor::text,
    'journal_entry.reversed', 'journal_entry', src.id::text, 'warning',
    jsonb_build_object('reversal_entry_id', v_new_id, 'reason', p_reason)
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorized posting of a single (manual) journal entry.
-- ---------------------------------------------------------------------------
create or replace function post_journal_entry(
  p_entry_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  e record;
begin
  select * into e from journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'ENTRY_NOT_FOUND';
  end if;
  if e.status = 'posted' then
    return jsonb_build_object('already_posted', true, 'entry_id', e.id);
  end if;
  if e.status <> 'draft' then
    raise exception 'ENTRY_NOT_POSTED' using message = 'entry is not a draft';
  end if;

  update journal_entries
  set status = 'posted', posted_by = p_actor
  where id = p_entry_id; -- scope + balance enforced by triggers

  insert into audit_events (
    company_id, fiscal_year_id, actor_type, actor_id, action,
    target_type, target_id, details
  ) values (
    e.company_id, e.fiscal_year_id, 'user', p_actor::text,
    'journal_entry.posted', 'journal_entry', p_entry_id::text, '{}'::jsonb
  );

  return jsonb_build_object('posted', true, 'entry_id', p_entry_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorized, idempotent posting of an import batch.
-- Requires: batch 'ready_to_post', an approved post_import_batch approval,
-- all staging rows valid, no open error issues, only supported record kinds.
-- Journal candidates become posted journal entries (validated by the same
-- balance/scope triggers); document rows become registry documents.
-- Re-running against a posted batch returns already_posted — no duplicates.
-- ---------------------------------------------------------------------------
create or replace function post_import_batch(
  p_batch_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b record;
  v_approval uuid;
  r record;
  v_entry_id uuid;
  v_doc_id uuid;
  v_period uuid;
  v_account uuid;
  v_line_no int;
  v_posted_entries int := 0;
  v_posted_docs int := 0;
  v_line jsonb;
  v_amount numeric;
begin
  select * into b from import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'BATCH_NOT_FOUND';
  end if;
  if b.status = 'posted' then
    return jsonb_build_object('already_posted', true, 'batch_id', b.id);
  end if;
  if b.status <> 'ready_to_post' then
    raise exception 'BATCH_NOT_READY'
      using message = format('batch status is %s; expected ready_to_post', b.status);
  end if;

  -- authorized posting: an approved approval must exist for this batch
  select id into v_approval
  from approvals
  where company_id = b.company_id
    and action = 'post_import_batch'
    and target_type = 'import_batch'
    and target_id = b.id
    and status = 'approved'
  order by decided_at desc
  limit 1;
  if v_approval is null then
    raise exception 'APPROVAL_REQUIRED'
      using message = 'posting requires an approved post_import_batch approval';
  end if;

  -- staging must be fully validated with no open errors
  if exists (
    select 1 from import_staging_records
    where import_batch_id = b.id and validation_status <> 'valid'
  ) then
    raise exception 'STAGING_NOT_VALID'
      using message = 'all staging records must be valid before posting';
  end if;
  if exists (
    select 1 from import_validation_issues
    where import_batch_id = b.id and severity = 'error' and status = 'open'
  ) then
    raise exception 'OPEN_ERROR_ISSUES'
      using message = 'open error issues must be resolved before posting';
  end if;
  if exists (
    select 1 from import_staging_records
    where import_batch_id = b.id
      and post_status = 'pending'
      and record_kind not in ('journal_candidate', 'document')
  ) then
    raise exception 'UNSUPPORTED_KIND_PENDING'
      using message = 'this pipeline version posts only journal_candidate and document records';
  end if;

  update import_batches
  set status = 'posting', stage = 'posting', approval_id = v_approval
  where id = b.id;

  -- 1) journal candidates -> posted journal entries (idempotent via content hash)
  for r in
    select * from import_staging_records
    where import_batch_id = b.id
      and record_kind = 'journal_candidate'
      and post_status = 'pending'
    order by source_row_no
  loop
    v_entry_id := null;

    insert into journal_entries (
      company_id, fiscal_year_id, entry_date, source_type,
      import_batch_id, staging_record_id, memo, status, content_hash, created_by
    ) values (
      b.company_id, b.fiscal_year_id,
      (r.normalized->>'entry_date')::date,
      'import', b.id, r.id,
      coalesce(r.normalized->>'memo', r.payload->>'description'),
      'draft', r.source_line_hash, p_actor
    )
    on conflict (company_id, fiscal_year_id, content_hash)
      where content_hash is not null
    do nothing
    returning id into v_entry_id;

    if v_entry_id is null then
      -- identical content already exists from an earlier run: reuse it
      select id into v_entry_id from journal_entries
      where company_id = b.company_id
        and fiscal_year_id = b.fiscal_year_id
        and content_hash = r.source_line_hash;
      update import_staging_records
      set post_status = 'skipped', posted_journal_entry_id = v_entry_id
      where id = r.id;
      continue;
    end if;

    v_line_no := 1;
    for v_line in select * from jsonb_array_elements(r.normalized->'lines')
    loop
      v_amount := (v_line->>'amount')::numeric;
      if v_amount <> trunc(v_amount) then
        raise exception 'AMOUNT_NOT_INTEGER'
          using message = 'monetary amounts must be exact integers';
      end if;
      if v_line->>'side' not in ('debit', 'credit') then
        raise exception 'INVALID_SIDE'
          using message = 'line side must be debit or credit';
      end if;
      select id into v_account
      from chart_of_accounts
      where fiscal_year_id = b.fiscal_year_id
        and company_id = b.company_id
        and code = v_line->>'account_code'
        and is_postable
        and status = 'active';
      if v_account is null then
        raise exception 'ACCOUNT_NOT_FOUND'
          using message = format('account code %s not found in fiscal year chart',
                                 v_line->>'account_code');
      end if;

      insert into journal_entry_lines (
        journal_entry_id, line_no, account_id, side, amount, currency, description,
        staging_record_id
      ) values (
        v_entry_id, v_line_no, v_account,
        (v_line->>'side')::fz_side, v_amount,
        coalesce(v_line->>'currency', 'IRR'),
        v_line->>'description', r.id
      );
      v_line_no := v_line_no + 1;
    end loop;

    -- posting gate: balance + fiscal year open (trigger-validated)
    update journal_entries
    set status = 'posted', posted_by = p_actor
    where id = v_entry_id;

    update import_staging_records
    set post_status = 'posted', posted_journal_entry_id = v_entry_id
    where id = r.id;

    v_posted_entries := v_posted_entries + 1;
  end loop;

  -- 2) document records -> document registry rows (idempotent via content hash)
  for r in
    select * from import_staging_records
    where import_batch_id = b.id
      and record_kind = 'document'
      and post_status = 'pending'
    order by source_row_no
  loop
    v_doc_id := null;
    insert into documents (
      company_id, fiscal_year_id, document_type, document_no, document_date,
      description, currency, amount_total, status, source,
      import_batch_id, import_source_file_id, staging_record_id,
      content_hash, created_by, posted_at, posted_by
    ) values (
      b.company_id, b.fiscal_year_id,
      (r.normalized->>'document_type')::fz_document_type,
      r.normalized->>'document_no',
      (r.normalized->>'document_date')::date,
      r.normalized->>'description',
      coalesce(r.normalized->>'currency', 'IRR'),
      (r.normalized->>'amount')::numeric,
      'posted', 'import',
      b.id, b.source_file_id, r.id,
      r.source_line_hash, p_actor, now(), p_actor
    )
    on conflict (company_id, fiscal_year_id, document_type, content_hash)
      where content_hash is not null
    do nothing
    returning id into v_doc_id;

    if v_doc_id is null then
      select id into v_doc_id from documents
      where company_id = b.company_id
        and fiscal_year_id = b.fiscal_year_id
        and document_type = (r.normalized->>'document_type')::fz_document_type
        and content_hash = r.source_line_hash;
      update import_staging_records
      set post_status = 'skipped', posted_document_id = v_doc_id
      where id = r.id;
      continue;
    end if;

    update import_staging_records
    set post_status = 'posted', posted_document_id = v_doc_id
    where id = r.id;

    v_posted_docs := v_posted_docs + 1;
  end loop;

  update import_batches
  set status = 'posted', stage = 'posted', posted_at = now(), posted_by = p_actor,
      stats = stats || jsonb_build_object(
        'posted_journal_entries', v_posted_entries,
        'posted_documents', v_posted_docs
      )
  where id = b.id;

  insert into audit_events (
    company_id, fiscal_year_id, actor_type, actor_id, action,
    target_type, target_id, severity, details
  ) values (
    b.company_id, b.fiscal_year_id, 'user', p_actor::text,
    'import_batch.posted', 'import_batch', b.id::text, 'warning',
    jsonb_build_object(
      'approval_id', v_approval,
      'posted_journal_entries', v_posted_entries,
      'posted_documents', v_posted_docs
    )
  );

  return jsonb_build_object(
    'batch_id', b.id,
    'posted_journal_entries', v_posted_entries,
    'posted_documents', v_posted_docs
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Back-reference from staging to journal entries (table created above).
-- ---------------------------------------------------------------------------
alter table import_staging_records
  add constraint fk_staging_posted_journal
  foreign key (posted_journal_entry_id) references journal_entries(id)
  on delete restrict;
