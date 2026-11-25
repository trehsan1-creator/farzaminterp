-- ============================================================================
-- 0004 — Master data: chart of accounts, counterparties, bank accounts
-- Farzam ERP / Stage 00
--
-- The chart of accounts is scoped per fiscal year (fiscal_years are
-- independent workspaces), so FY1404 carries its own reviewed account
-- structure. Counterparties and bank accounts are company-level master data
-- shared read-only across fiscal years; no financial amounts live here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- chart_of_accounts
-- ---------------------------------------------------------------------------
create table if not exists chart_of_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete restrict,
  fiscal_year_id  uuid not null references fiscal_years(id) on delete restrict,
  code            text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$'),
  parent_id       uuid references chart_of_accounts(id) on delete restrict,
  name_fa         text not null check (length(btrim(name_fa)) > 0),
  name_en         text,
  account_type    fz_account_type not null,
  normal_balance  fz_side not null,
  is_postable     boolean not null default true,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (fiscal_year_id, code),
  -- normal balance must match the account type
  constraint chart_acct_type_balance check (
    (account_type in ('asset', 'expense') and normal_balance = 'debit')
    or
    (account_type in ('liability', 'equity', 'revenue') and normal_balance = 'credit')
  )
);

comment on table chart_of_accounts is
  'Per-fiscal-year chart of accounts. Accounts of other fiscal years are never reused implicitly.';

create index if not exists idx_coa_company_fy
  on chart_of_accounts(company_id, fiscal_year_id);
create index if not exists idx_coa_parent
  on chart_of_accounts(parent_id);

create trigger chart_of_accounts_touch_updated_at
  before update on chart_of_accounts
  for each row execute function fz_touch_updated_at();

create trigger chart_of_accounts_fy_scope
  before insert or update on chart_of_accounts
  for each row execute function fz_trigger_assert_fy_scope();

-- ---------------------------------------------------------------------------
-- counterparties (company master data, no fiscal-year scoping)
-- ---------------------------------------------------------------------------
create table if not exists counterparties (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete restrict,
  code          text,
  name_fa       text not null check (length(btrim(name_fa)) > 0),
  name_en       text,
  kind          fz_counterparty_kind not null default 'other',
  tax_id        text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

create unique index if not exists uq_counterparties_company_code
  on counterparties(company_id, code) where code is not null;
create index if not exists idx_counterparties_company_name
  on counterparties(company_id, name_fa);

create trigger counterparties_touch_updated_at
  before update on counterparties
  for each row execute function fz_touch_updated_at();

-- ---------------------------------------------------------------------------
-- bank_accounts (company master data; balances derive from bank_transactions)
-- ---------------------------------------------------------------------------
create table if not exists bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete restrict,
  label         text not null check (length(btrim(label)) > 0),
  bank_name     text not null check (length(btrim(bank_name)) > 0),
  branch_name   text,
  account_no    text,
  iban          text,
  currency      char(3) not null default 'IRR'
                  check (currency in ('IRR', 'IRT')),
  status        text not null default 'active' check (status in ('active', 'closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

create unique index if not exists uq_bank_accounts_company_iban
  on bank_accounts(company_id, iban) where iban is not null;
create index if not exists idx_bank_accounts_company
  on bank_accounts(company_id);

create trigger bank_accounts_touch_updated_at
  before update on bank_accounts
  for each row execute function fz_touch_updated_at();
