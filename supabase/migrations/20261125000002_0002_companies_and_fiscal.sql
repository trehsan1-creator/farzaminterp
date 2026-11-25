-- ============================================================================
-- 0002 — Companies, membership, fiscal years, fiscal periods
-- Farzam ERP / Stage 00
--
-- Fiscal years are independent operational contexts. Every financial table
-- references fiscal_years, and triggers assert that a row's company matches
-- the fiscal year's company (fz_assert_fy_scope) so records can never leak
-- across company/fiscal-year boundaries.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- auth.uid() shim — no-op on Supabase (auth.uid already exists); allows the
-- migrations to also apply to a vanilla PostgreSQL used for CI verification.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'uid' and n.nspname = 'auth'
  ) then
    create function auth.uid() returns uuid
    language sql stable
    as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $fn$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique
                    check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$'),
  name_fa         text not null check (length(btrim(name_fa)) > 0),
  name_en         text,
  base_currency   char(3) not null default 'IRR'
                    check (base_currency in ('IRR', 'IRT')),
  status          fz_company_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column companies.base_currency is
  'Explicit base currency code: IRR = Rial, IRT = Toman. Never inferred from numeric magnitude.';

create trigger companies_touch_updated_at
  before update on companies
  for each row execute function fz_touch_updated_at();

-- ---------------------------------------------------------------------------
-- company_members — RLS authorization basis (who may see/modify a company)
-- ---------------------------------------------------------------------------
create table if not exists company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        fz_member_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists idx_company_members_user
  on company_members(user_id);

create trigger company_members_touch_updated_at
  before update on company_members
  for each row execute function fz_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helper predicates used by RLS policies (security definer: policies must be
-- able to read membership without recursing into RLS).
-- ---------------------------------------------------------------------------
create or replace function fz_is_company_member(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function fz_has_role(p_company_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role::text = any (p_roles)
  );
$$;

revoke all on function fz_is_company_member(uuid) from public;
revoke all on function fz_has_role(uuid, text[]) from public;
grant execute on function fz_is_company_member(uuid) to authenticated;
grant execute on function fz_has_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity assertions used by row triggers
-- ---------------------------------------------------------------------------
create or replace function fz_assert_fy_scope(p_company_id uuid, p_fiscal_year_id uuid)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_fiscal_year_id is null then
    raise exception 'FISCAL_YEAR_REQUIRED'
      using message = 'fiscal_year_id is required for financial records';
  end if;
  if not exists (
    select 1 from fiscal_years
    where id = p_fiscal_year_id and company_id = p_company_id
  ) then
    raise exception 'FISCAL_YEAR_COMPANY_MISMATCH'
      using message = 'fiscal year does not belong to this company';
  end if;
end;
$$;

create or replace function fz_assert_date_in_fy(p_fiscal_year_id uuid, p_date date)
returns void
language plpgsql stable security definer
set search_path = public
as $$
declare
  fy record;
begin
  if p_date is null then
    return; -- missing dates are never invented; validation flags them instead
  end if;
  select start_date, end_date into fy
  from fiscal_years where id = p_fiscal_year_id;
  if not found then
    raise exception 'FISCAL_YEAR_NOT_FOUND'
      using message = 'fiscal year does not exist';
  end if;
  if p_date < fy.start_date or p_date > fy.end_date then
    raise exception 'DATE_OUTSIDE_FISCAL_YEAR'
      using message = format('date %s is outside fiscal year %s..%s',
                             p_date, fy.start_date, fy.end_date);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- fiscal_years
-- ---------------------------------------------------------------------------
create table if not exists fiscal_years (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete restrict,
  label         text not null check (label ~ '^[0-9]{4}$'),
  start_date    date not null,
  end_date      date not null,
  status        fz_fiscal_year_status not null default 'open',
  -- Reconstruction workspace flag: FY1404 is being rebuilt from source files.
  is_reconstruction boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fiscal_years_range check (end_date > start_date),
  unique (company_id, label),
  unique (company_id, start_date)
);

comment on table fiscal_years is
  'Independent fiscal-year workspaces. Status ''closed'' is reachable only via the approval-gated close routine (migration 0003).';

create index if not exists idx_fiscal_years_company_status
  on fiscal_years(company_id, status);

create trigger fiscal_years_touch_updated_at
  before update on fiscal_years
  for each row execute function fz_touch_updated_at();

-- ---------------------------------------------------------------------------
-- fiscal_periods
-- ---------------------------------------------------------------------------
create table if not exists fiscal_periods (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete restrict,
  fiscal_year_id  uuid not null references fiscal_years(id) on delete cascade,
  period_no       int not null check (period_no between 1 and 13),
  label           text not null check (length(btrim(label)) > 0),
  start_date      date not null,
  end_date        date not null,
  status          fz_period_status not null default 'open',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fiscal_periods_range check (end_date >= start_date),
  unique (fiscal_year_id, period_no)
);

create index if not exists idx_fiscal_periods_year
  on fiscal_periods(fiscal_year_id, start_date);

create trigger fiscal_periods_touch_updated_at
  before update on fiscal_periods
  for each row execute function fz_touch_updated_at();

-- Period rows must belong to the same company as their fiscal year, live
-- inside the fiscal-year bounds, and must not overlap another period.
create or replace function fz_assert_fiscal_period_shape() returns trigger
language plpgsql as $$
declare
  fy record;
begin
  select company_id, start_date, end_date into fy
  from fiscal_years where id = new.fiscal_year_id;
  if not found then
    raise exception 'FISCAL_YEAR_NOT_FOUND';
  end if;
  if new.company_id <> fy.company_id then
    raise exception 'FISCAL_YEAR_COMPANY_MISMATCH';
  end if;
  if new.start_date < fy.start_date or new.end_date > fy.end_date then
    raise exception 'PERIOD_OUTSIDE_FISCAL_YEAR'
      using message = 'fiscal period must lie inside its fiscal year';
  end if;
  if exists (
    select 1 from fiscal_periods p
    where p.fiscal_year_id = new.fiscal_year_id
      and p.id is distinct from new.id
      and daterange(p.start_date, p.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'PERIOD_OVERLAP'
      using message = 'fiscal periods must not overlap';
  end if;
  return new;
end;
$$;

create trigger fiscal_periods_shape
  before insert or update on fiscal_periods
  for each row execute function fz_assert_fiscal_period_shape();

-- ---------------------------------------------------------------------------
-- Generic scope trigger: company_id must match fiscal_years.company_id.
-- Applied to every table that carries both columns.
-- ---------------------------------------------------------------------------
create or replace function fz_trigger_assert_fy_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  return new;
end;
$$;
