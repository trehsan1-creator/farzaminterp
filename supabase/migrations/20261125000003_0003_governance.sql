-- ============================================================================
-- 0003 — Governance: approvals, audit events, approval-gated FY closing
-- Farzam ERP / Stage 00
--
-- approvals  — human authorization for sensitive/irreversible actions
--              (import posting, FY closing, reversals, amendments).
-- audit_events — append-only history; UPDATE/DELETE are rejected outright.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete restrict,
  fiscal_year_id  uuid references fiscal_years(id) on delete restrict,
  action          fz_approval_action not null,
  target_type     text not null check (length(btrim(target_type)) > 0),
  target_id       uuid not null,
  requested_by    uuid references auth.users(id) on delete set null,
  requested_at    timestamptz not null default now(),
  status          fz_approval_status not null default 'pending',
  decided_by      uuid references auth.users(id) on delete set null,
  decided_at      timestamptz,
  decision_comment text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint approvals_decided_consistency check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or
    (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

comment on table approvals is
  'Human approval requests. Sensitive actions (batch posting, FY closing, reversals) require an approved row before execution.';

create index if not exists idx_approvals_target
  on approvals(target_type, target_id, status);
create index if not exists idx_approvals_company_pending
  on approvals(company_id, status) where status = 'pending';

create trigger approvals_touch_updated_at
  before update on approvals
  for each row execute function fz_touch_updated_at();

-- Approvals move forward only: pending -> approved|rejected, then immutable.
create or replace function fz_assert_approval_transition() returns trigger
language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_DECIDED'
      using message = 'an approval decision cannot be changed';
  end if;
  if new.status = 'pending' then
    raise exception 'APPROVAL_DECISION_REQUIRED'
      using message = 'an approval must be approved or rejected';
  end if;
  if new.company_id is distinct from old.company_id
     or new.target_id is distinct from old.target_id
     or new.action is distinct from old.action then
    raise exception 'APPROVAL_IMMUTABLE_FIELDS'
      using message = 'approval target fields cannot be changed after creation';
  end if;
  new.decided_at := coalesce(new.decided_at, now());
  return new;
end;
$$;

create trigger approvals_transition
  before update on approvals
  for each row execute function fz_assert_approval_transition();

-- ---------------------------------------------------------------------------
-- audit_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists audit_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references companies(id) on delete restrict,
  fiscal_year_id  uuid references fiscal_years(id) on delete restrict,
  actor_type      fz_actor_type not null,
  actor_id        text,
  actor_label     text,
  action          text not null check (length(btrim(action)) > 0),
  target_type     text,
  target_id       text,
  severity        fz_issue_severity not null default 'info',
  request_id      text,
  details         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table audit_events is
  'Immutable audit log. Secrets, credentials and full document contents must never be written into details.';

create index if not exists idx_audit_events_company_time
  on audit_events(company_id, occurred_at desc);
create index if not exists idx_audit_events_target
  on audit_events(target_type, target_id);
create index if not exists idx_audit_events_fy_time
  on audit_events(fiscal_year_id, occurred_at desc);

create or replace function fz_assert_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'APPEND_ONLY_TABLE'
    using message = format('%s is append-only; updates and deletes are not permitted',
                           tg_table_name);
end;
$$;

create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function fz_assert_append_only();

-- ---------------------------------------------------------------------------
-- Approval-gated fiscal-year closing.
-- FY1404 must never be closed without an approved close_fiscal_year approval.
-- ---------------------------------------------------------------------------
create or replace function fz_assert_fiscal_year_close() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_approval uuid;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    select id into v_approval
    from approvals
    where company_id = old.company_id
      and action = 'close_fiscal_year'
      and target_type = 'fiscal_year'
      and target_id = new.id
      and status = 'approved'
    order by decided_at desc
    limit 1;
    if v_approval is null then
      raise exception 'FY_CLOSE_APPROVAL_REQUIRED'
        using message = 'a fiscal year can only be closed with an approved close_fiscal_year approval';
    end if;
  end if;
  if new.company_id is distinct from old.company_id
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.label is distinct from old.label then
    raise exception 'FY_IMMUTABLE_BOUNDARIES'
      using message = 'fiscal year identity and boundaries cannot be changed';
  end if;
  return new;
end;
$$;

create trigger fiscal_years_close_gate
  before update on fiscal_years
  for each row execute function fz_assert_fiscal_year_close();
