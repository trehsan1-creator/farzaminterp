-- ============================================================================
-- 0007 — Operational financial transactions
-- Farzam ERP / Stage 00
--
-- bank_transactions, sales_invoices, purchase_invoices, tax_returns,
-- fixed_assets.
--
-- Rules enforced here:
--   * every row belongs to an explicit company + fiscal year (scope trigger);
--   * money is NUMERIC(20,0) with an explicit currency column (never inferred);
--   * a stated transaction date must fall inside its fiscal year;
--   * import-sourced rows carry batch + staging provenance and a content hash
--     so re-imports cannot duplicate financial facts;
--   * fixed assets may have acquisition dates before the fiscal year start
--     (historical acquisition registered in this FY workspace) — only the
--     company/fiscal-year scope is enforced for them.
-- None of these tables is populated by Stage 00 with unverified data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- bank_transactions
-- ---------------------------------------------------------------------------
create table if not exists bank_transactions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid not null references fiscal_years(id) on delete restrict,
  bank_account_id     uuid not null references bank_accounts(id) on delete restrict,
  document_id         uuid references documents(id) on delete restrict,
  txn_date            date not null,
  direction           fz_txn_direction not null,
  amount              numeric(20, 0) not null check (amount > 0),
  currency            char(3) not null default 'IRR'
                        check (currency in ('IRR', 'IRT')),
  counterparty_id     uuid references counterparties(id) on delete restrict,
  counterparty_name_raw text,
  reference_no        text,
  description         text,
  source              text not null default 'manual'
                        check (source in ('manual', 'import')),
  import_batch_id     uuid references import_batches(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  posting_status      fz_posting_status not null default 'staged',
  created_by          uuid references auth.users(id) on delete set null,
  posted_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint bank_txn_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

create unique index if not exists uq_bank_transactions_content_hash
  on bank_transactions(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;
create index if not exists idx_bank_txn_registry
  on bank_transactions(company_id, fiscal_year_id, txn_date desc);
create index if not exists idx_bank_txn_account
  on bank_transactions(bank_account_id, txn_date);

create trigger bank_transactions_touch_updated_at
  before update on bank_transactions
  for each row execute function fz_touch_updated_at();

create or replace function fz_assert_bank_txn_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.txn_date);
  return new;
end;
$$;

create trigger bank_transactions_scope
  before insert or update on bank_transactions
  for each row execute function fz_assert_bank_txn_scope();

-- ---------------------------------------------------------------------------
-- sales_invoices / purchase_invoices
-- source_payload preserves the source line items verbatim (JSON) until the
-- full invoice modules are built; header totals are exact integers.
-- ---------------------------------------------------------------------------
create table if not exists sales_invoices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid not null references fiscal_years(id) on delete restrict,
  invoice_no          text not null,
  issue_date          date not null,
  due_date            date,
  counterparty_id     uuid references counterparties(id) on delete restrict,
  currency            char(3) not null default 'IRR'
                        check (currency in ('IRR', 'IRT')),
  subtotal            numeric(20, 0),
  tax_amount          numeric(20, 0),
  total               numeric(20, 0) not null,
  status              fz_invoice_status not null default 'staged',
  source              text not null default 'manual'
                        check (source in ('manual', 'import')),
  import_batch_id     uuid references import_batches(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  source_payload      jsonb,
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by          uuid references auth.users(id) on delete set null,
  posted_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sales_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

create unique index if not exists uq_sales_invoices_content_hash
  on sales_invoices(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;
create index if not exists idx_sales_invoices_registry
  on sales_invoices(company_id, fiscal_year_id, issue_date desc);

create trigger sales_invoices_touch_updated_at
  before update on sales_invoices
  for each row execute function fz_touch_updated_at();

create or replace function fz_assert_sales_invoice_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.issue_date);
  if new.due_date is not null then
    perform fz_assert_date_in_fy(new.fiscal_year_id, new.due_date);
  end if;
  return new;
end;
$$;

create trigger sales_invoices_scope
  before insert or update on sales_invoices
  for each row execute function fz_assert_sales_invoice_scope();

create table if not exists purchase_invoices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid not null references fiscal_years(id) on delete restrict,
  invoice_no          text not null,
  issue_date          date not null,
  due_date            date,
  counterparty_id     uuid references counterparties(id) on delete restrict,
  currency            char(3) not null default 'IRR'
                        check (currency in ('IRR', 'IRT')),
  subtotal            numeric(20, 0),
  tax_amount          numeric(20, 0),
  total               numeric(20, 0) not null,
  status              fz_invoice_status not null default 'staged',
  source              text not null default 'manual'
                        check (source in ('manual', 'import')),
  import_batch_id     uuid references import_batches(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  source_payload      jsonb,
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by          uuid references auth.users(id) on delete set null,
  posted_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint purchase_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

create unique index if not exists uq_purchase_invoices_content_hash
  on purchase_invoices(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;
create index if not exists idx_purchase_invoices_registry
  on purchase_invoices(company_id, fiscal_year_id, issue_date desc);

create trigger purchase_invoices_touch_updated_at
  before update on purchase_invoices
  for each row execute function fz_touch_updated_at();

create or replace function fz_assert_purchase_invoice_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.issue_date);
  if new.due_date is not null then
    perform fz_assert_date_in_fy(new.fiscal_year_id, new.due_date);
  end if;
  return new;
end;
$$;

create trigger purchase_invoices_scope
  before insert or update on purchase_invoices
  for each row execute function fz_assert_purchase_invoice_scope();

-- ---------------------------------------------------------------------------
-- tax_returns
-- ---------------------------------------------------------------------------
create table if not exists tax_returns (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid not null references fiscal_years(id) on delete restrict,
  fiscal_period_id    uuid references fiscal_periods(id) on delete restrict,
  return_type         text not null
                        check (return_type in ('vat', 'income', 'salary', 'other')),
  period_start        date not null,
  period_end          date not null,
  declared_base       numeric(20, 0),
  declared_tax        numeric(20, 0),
  payable             numeric(20, 0),
  paid                numeric(20, 0),
  currency            char(3) not null default 'IRR'
                        check (currency in ('IRR', 'IRT')),
  status              fz_tax_return_status not null default 'draft',
  filed_date          date,
  authority_reference text,
  source              text not null default 'manual'
                        check (source in ('manual', 'import')),
  import_batch_id     uuid references import_batches(id) on delete restrict,
  staging_record_id   uuid references import_staging_records(id) on delete restrict,
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tax_returns_range check (period_end >= period_start),
  constraint tax_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

create unique index if not exists uq_tax_returns_content_hash
  on tax_returns(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;
create index if not exists idx_tax_returns_registry
  on tax_returns(company_id, fiscal_year_id, period_start);

create trigger tax_returns_touch_updated_at
  before update on tax_returns
  for each row execute function fz_touch_updated_at();

create or replace function fz_assert_tax_return_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.period_start);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.period_end);
  if new.fiscal_period_id is not null then
    if not exists (
      select 1 from fiscal_periods p
      where p.id = new.fiscal_period_id
        and p.fiscal_year_id = new.fiscal_year_id
    ) then
      raise exception 'PERIOD_FISCAL_YEAR_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger tax_returns_scope
  before insert or update on tax_returns
  for each row execute function fz_assert_tax_return_scope();

-- ---------------------------------------------------------------------------
-- fixed_assets
-- Acquisition cost is historical fact and may predate the fiscal year; only
-- company/fiscal-year scope is enforced. Depreciation arithmetic lives in the
-- asset module (later stage) using exact integer/NUMERIC math.
-- ---------------------------------------------------------------------------
create table if not exists fixed_assets (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id) on delete restrict,
  fiscal_year_id          uuid not null references fiscal_years(id) on delete restrict,
  asset_code              text not null,
  name_fa                 text not null check (length(btrim(name_fa)) > 0),
  acquisition_date        date not null,
  acquisition_cost        numeric(20, 0) not null check (acquisition_cost > 0),
  currency                char(3) not null default 'IRR'
                            check (currency in ('IRR', 'IRT')),
  useful_life_months      int check (useful_life_months is null or useful_life_months > 0),
  depreciation_method     text not null default 'straight_line'
                            check (depreciation_method in ('straight_line', 'declining', 'none')),
  residual_value          numeric(20, 0) not null default 0 check (residual_value >= 0),
  accumulated_depreciation numeric(20, 0) not null default 0
                            check (accumulated_depreciation >= 0),
  status                  fz_asset_status not null default 'active',
  disposed_date           date,
  source                  text not null default 'manual'
                            check (source in ('manual', 'import')),
  import_batch_id         uuid references import_batches(id) on delete restrict,
  staging_record_id       uuid references import_staging_records(id) on delete restrict,
  content_hash            text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint fixed_assets_disposed_consistency check (
    (status = 'disposed' and disposed_date is not null)
    or (status = 'active' and disposed_date is null)
  ),
  constraint fixed_assets_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

create unique index if not exists uq_fixed_assets_code_fy
  on fixed_assets(fiscal_year_id, asset_code);
create unique index if not exists uq_fixed_assets_content_hash
  on fixed_assets(company_id, fiscal_year_id, content_hash)
  where content_hash is not null;

create trigger fixed_assets_touch_updated_at
  before update on fixed_assets
  for each row execute function fz_touch_updated_at();

create trigger fixed_assets_fy_scope
  before insert or update on fixed_assets
  for each row execute function fz_trigger_assert_fy_scope();
