-- 0013 — Operational master data, inventory, payroll and opening-balance workspaces.
-- Additive only. These are draft/proposal domains; no financial posting is performed here.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null check (length(btrim(code)) > 0),
  name_fa text not null check (length(btrim(name_fa)) > 0),
  name_en text,
  unit text not null default 'عدد',
  description text,
  category text,
  list_price_rial numeric(20,0) check (list_price_rial is null or list_price_rial >= 0),
  cost_price_rial numeric(20,0) check (cost_price_rial is null or cost_price_rial >= 0),
  pricing_status text not null default 'not_provided'
    check (pricing_status in ('not_provided','needs_review','approved')),
  is_taxable boolean,
  status text not null default 'active' check (status in ('active','inactive')),
  source_system text,
  source_external_id text,
  data_quality_status text not null default 'needs_review'
    check (data_quality_status in ('verified','needs_review','unverified','conflict')),
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);
create unique index if not exists uq_products_source_ref
  on public.products(company_id,source_system,source_external_id)
  where source_system is not null and source_external_id is not null;
create index if not exists idx_products_company_status
  on public.products(company_id,status,code);
create trigger products_touch_updated_at before update on public.products
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null check (length(btrim(code)) > 0),
  name_fa text not null check (length(btrim(name_fa)) > 0),
  location text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);
create index if not exists idx_warehouses_company_status
  on public.warehouses(company_id,status);
create trigger warehouses_touch_updated_at before update on public.warehouses
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_no text not null check (length(btrim(employee_no)) > 0),
  name_fa text not null check (length(btrim(name_fa)) > 0),
  national_id text,
  mobile text,
  job_title text,
  employment_status text not null default 'unknown'
    check (employment_status in ('active','inactive','unknown')),
  payroll_data_status text not null default 'missing'
    check (payroll_data_status in ('missing','partial','verified')),
  source_system text,
  source_external_id text,
  data_quality_status text not null default 'needs_review'
    check (data_quality_status in ('verified','needs_review','unverified','conflict')),
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,employee_no)
);
create unique index if not exists uq_employees_national_id
  on public.employees(company_id,national_id)
  where national_id is not null and national_id <> '';
create trigger employees_touch_updated_at before update on public.employees
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  period_no integer not null check (period_no between 1 and 12),
  period_label text not null,
  period_start date not null,
  period_end date not null,
  employee_count integer check (employee_count is null or employee_count >= 0),
  gross_pay_rial numeric(20,0) check (gross_pay_rial is null or gross_pay_rial >= 0),
  deductions_rial numeric(20,0) check (deductions_rial is null or deductions_rial >= 0),
  net_pay_rial numeric(20,0) check (net_pay_rial is null or net_pay_rial >= 0),
  currency char(3) not null default 'IRR' check (currency in ('IRR','IRT')),
  status text not null default 'draft'
    check (status in ('draft','review','approved','posted','void')),
  source_observation_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,fiscal_year_id,period_no)
);
create index if not exists idx_payroll_runs_fy
  on public.payroll_runs(company_id,fiscal_year_id,period_no);

create or replace function public.fz_assert_payroll_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.fz_assert_fy_scope(new.company_id,new.fiscal_year_id);
  perform public.fz_assert_date_in_fy(new.fiscal_year_id,new.period_start);
  perform public.fz_assert_date_in_fy(new.fiscal_year_id,new.period_end);
  if new.period_end < new.period_start then
    raise exception 'PAYROLL_PERIOD_RANGE_INVALID';
  end if;
  return new;
end;
$$;
create trigger payroll_runs_scope before insert or update on public.payroll_runs
  for each row execute function public.fz_assert_payroll_scope();
create trigger payroll_runs_touch_updated_at before update on public.payroll_runs
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross_pay_rial numeric(20,0) not null check (gross_pay_rial >= 0),
  tax_rial numeric(20,0) not null default 0 check (tax_rial >= 0),
  insurance_rial numeric(20,0) not null default 0 check (insurance_rial >= 0),
  other_deductions_rial numeric(20,0) not null default 0 check (other_deductions_rial >= 0),
  net_pay_rial numeric(20,0) not null check (net_pay_rial >= 0),
  payment_date date,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_run_id,employee_id)
);
create index if not exists idx_payroll_items_employee
  on public.payroll_items(employee_id,payroll_run_id);
create index if not exists idx_payroll_items_run
  on public.payroll_items(payroll_run_id);
create index if not exists idx_payroll_items_employee_fk
  on public.payroll_items(employee_id);
create or replace function public.fz_assert_payroll_item_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.payroll_runs r
    join public.employees e on e.id = new.employee_id
    where r.id = new.payroll_run_id
      and r.company_id = new.company_id
      and r.fiscal_year_id = new.fiscal_year_id
      and e.company_id = new.company_id
  ) then
    raise exception 'PAYROLL_ITEM_SCOPE_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger payroll_items_scope before insert or update on public.payroll_items
  for each row execute function public.fz_assert_payroll_item_scope();
create trigger payroll_items_touch_updated_at before update on public.payroll_items
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  sales_invoice_id uuid not null references public.sales_invoices(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  product_id uuid references public.products(id) on delete restrict,
  description text not null,
  quantity numeric(20,3) not null default 1 check (quantity > 0),
  unit text not null default 'عدد',
  unit_price_rial numeric(20,0) check (unit_price_rial is null or unit_price_rial >= 0),
  discount_rial numeric(20,0) not null default 0 check (discount_rial >= 0),
  tax_amount_rial numeric(20,0) not null default 0 check (tax_amount_rial >= 0),
  line_total_rial numeric(20,0) not null check (line_total_rial >= 0),
  created_at timestamptz not null default now(),
  unique(sales_invoice_id,line_no)
);
create index if not exists idx_sales_invoice_lines_header
  on public.sales_invoice_lines(sales_invoice_id,line_no);
create index if not exists idx_sales_invoice_lines_product_fk
  on public.sales_invoice_lines(product_id) where product_id is not null;

create table if not exists public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  product_id uuid references public.products(id) on delete restrict,
  description text not null,
  quantity numeric(20,3) not null default 1 check (quantity > 0),
  unit text not null default 'عدد',
  unit_price_rial numeric(20,0) check (unit_price_rial is null or unit_price_rial >= 0),
  discount_rial numeric(20,0) not null default 0 check (discount_rial >= 0),
  tax_amount_rial numeric(20,0) not null default 0 check (tax_amount_rial >= 0),
  line_total_rial numeric(20,0) not null check (line_total_rial >= 0),
  created_at timestamptz not null default now(),
  unique(purchase_invoice_id,line_no)
);
create index if not exists idx_purchase_invoice_lines_header
  on public.purchase_invoice_lines(purchase_invoice_id,line_no);
create index if not exists idx_purchase_invoice_lines_product_fk
  on public.purchase_invoice_lines(product_id) where product_id is not null;

create or replace function public.fz_assert_invoice_line_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  header_company uuid;
  header_fy uuid;
  product_company uuid;
begin
  if tg_table_name = 'sales_invoice_lines' then
    select company_id,fiscal_year_id into header_company,header_fy
    from public.sales_invoices where id = new.sales_invoice_id;
  else
    select company_id,fiscal_year_id into header_company,header_fy
    from public.purchase_invoices where id = new.purchase_invoice_id;
  end if;
  if header_company is null or header_company <> new.company_id or header_fy <> new.fiscal_year_id then
    raise exception 'INVOICE_LINE_HEADER_SCOPE_MISMATCH';
  end if;
  if new.product_id is not null then
    select company_id into product_company from public.products where id = new.product_id;
    if product_company is distinct from new.company_id then
      raise exception 'INVOICE_LINE_PRODUCT_SCOPE_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;
create trigger sales_invoice_lines_scope before insert or update on public.sales_invoice_lines
  for each row execute function public.fz_assert_invoice_line_scope();
create trigger purchase_invoice_lines_scope before insert or update on public.purchase_invoice_lines
  for each row execute function public.fz_assert_invoice_line_scope();

create table if not exists public.bank_account_opening_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  as_of_date date not null,
  amount numeric(20,0) not null check (amount >= 0),
  currency char(3) not null default 'IRR' check (currency in ('IRR','IRT')),
  status text not null default 'proposed' check (status in ('proposed','approved','reconciled')),
  source_name text not null,
  source_reference text,
  evidence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,fiscal_year_id,bank_account_id)
);
create index if not exists idx_bank_opening_fy
  on public.bank_account_opening_balances(company_id,fiscal_year_id);
create index if not exists idx_bank_opening_bank_account
  on public.bank_account_opening_balances(bank_account_id);
create or replace function public.fz_assert_bank_opening_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.fz_assert_fy_scope(new.company_id,new.fiscal_year_id);
  perform public.fz_assert_date_in_fy(new.fiscal_year_id,new.as_of_date);
  if not exists (
    select 1 from public.bank_accounts b
    where b.id = new.bank_account_id and b.company_id = new.company_id
  ) then
    raise exception 'BANK_OPENING_ACCOUNT_SCOPE_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger bank_account_opening_balances_scope
  before insert or update on public.bank_account_opening_balances
  for each row execute function public.fz_assert_bank_opening_scope();
create trigger bank_account_opening_balances_touch_updated_at
  before update on public.bank_account_opening_balances
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.opening_balance_proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  balance_type text not null check (balance_type in (
    'receivable','payable','prepayment','customer_advance','partner_current',
    'employee_advance','tax_payable','asset_summary','other'
  )),
  party_name text not null,
  amount numeric(20,0) not null check (amount >= 0),
  currency char(3) not null default 'IRR' check (currency in ('IRR','IRT')),
  as_of_date date not null,
  status text not null default 'needs_review'
    check (status in ('needs_review','approved','rejected','posted')),
  source_name text not null,
  source_reference text,
  evidence_note text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opening_balance_proposals
  on public.opening_balance_proposals(company_id,fiscal_year_id,status,balance_type);
create or replace function public.fz_assert_opening_proposal_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.fz_assert_fy_scope(new.company_id,new.fiscal_year_id);
  perform public.fz_assert_date_in_fy(new.fiscal_year_id,new.as_of_date);
  return new;
end;
$$;
create trigger opening_balance_proposals_scope before insert or update on public.opening_balance_proposals
  for each row execute function public.fz_assert_opening_proposal_scope();
create trigger opening_balance_proposals_touch_updated_at before update on public.opening_balance_proposals
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.source_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid references public.fiscal_years(id) on delete restrict,
  record_type text not null check (record_type in (
    'financial_summary','banking','tax','asset','payroll','counterparty',
    'product','operations','compliance','company_profile'
  )),
  fact_key text not null check (length(btrim(fact_key)) > 0),
  title_fa text not null check (length(btrim(title_fa)) > 0),
  amount numeric(20,0),
  currency char(3) check (currency is null or currency in ('IRR','IRT')),
  quantity numeric(20,3),
  source_status text not null check (source_status in (
    'verified','needs_review','unverified','conflict','not_provided','historical_snapshot'
  )),
  source_name text not null,
  source_reference text,
  evidence_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_source_observations_fact
  on public.source_observations(company_id,fiscal_year_id,fact_key);
create index if not exists idx_source_observations_type
  on public.source_observations(company_id,fiscal_year_id,record_type,source_status);
create trigger source_observations_touch_updated_at before update on public.source_observations
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.management_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid references public.fiscal_years(id) on delete restrict,
  question_no integer not null check (question_no > 0),
  title text not null check (length(btrim(title)) > 0),
  details text,
  status text not null default 'open' check (status in ('open','answered','deferred','closed')),
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  source_reference text,
  answer text,
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,question_no)
);
create index if not exists idx_management_questions
  on public.management_questions(company_id,status,priority,question_no);
create trigger management_questions_touch_updated_at before update on public.management_questions
  for each row execute function public.fz_touch_updated_at();

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  movement_no text not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in (
    'receipt','issue','adjustment_in','adjustment_out','transfer_in','transfer_out'
  )),
  movement_date date not null,
  quantity numeric(20,3) not null check (quantity > 0),
  unit_cost_rial numeric(20,0) check (unit_cost_rial is null or unit_cost_rial >= 0),
  total_cost_rial numeric(20,0) check (total_cost_rial is null or total_cost_rial >= 0),
  currency char(3) not null default 'IRR' check (currency in ('IRR','IRT')),
  status text not null default 'draft' check (status in ('draft','staged','posted','void')),
  source text not null default 'manual' check (source in ('manual','import')),
  import_batch_id uuid references public.import_batches(id) on delete restrict,
  source_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,fiscal_year_id,movement_no)
);
create index if not exists idx_inventory_movements_fy
  on public.inventory_movements(company_id,fiscal_year_id,movement_date desc);
create index if not exists idx_inventory_movements_product
  on public.inventory_movements(product_id,movement_date desc);
create index if not exists idx_inventory_movements_warehouse
  on public.inventory_movements(warehouse_id);
create index if not exists idx_inventory_movements_product_fk
  on public.inventory_movements(product_id);
create or replace function public.fz_assert_inventory_movement_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.fz_assert_fy_scope(new.company_id,new.fiscal_year_id);
  perform public.fz_assert_date_in_fy(new.fiscal_year_id,new.movement_date);
  if not exists (select 1 from public.products p where p.id=new.product_id and p.company_id=new.company_id) then
    raise exception 'INVENTORY_PRODUCT_COMPANY_MISMATCH';
  end if;
  if not exists (select 1 from public.warehouses w where w.id=new.warehouse_id and w.company_id=new.company_id) then
    raise exception 'INVENTORY_WAREHOUSE_COMPANY_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger inventory_movements_scope before insert or update on public.inventory_movements
  for each row execute function public.fz_assert_inventory_movement_scope();
create trigger inventory_movements_touch_updated_at before update on public.inventory_movements
  for each row execute function public.fz_touch_updated_at();

-- Business-table RLS: members read; authorized company roles create/update.
do $$
declare t text;
begin
  foreach t in array array[
    'products','warehouses','employees','payroll_runs','payroll_items',
    'sales_invoice_lines','purchase_invoice_lines','bank_account_opening_balances',
    'opening_balance_proposals','source_observations','management_questions','inventory_movements'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select,insert,update on public.%I to authenticated,service_role',t);
    execute format('drop policy if exists %I on public.%I',t || '_select',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.fz_is_company_member(company_id))',t || '_select',t);
  end loop;
end;
$$;

-- Explicit statements keep RLS coverage visible to migration review and CI.
alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.sales_invoice_lines enable row level security;
alter table public.purchase_invoice_lines enable row level security;
alter table public.bank_account_opening_balances enable row level security;
alter table public.opening_balance_proposals enable row level security;
alter table public.source_observations enable row level security;
alter table public.management_questions enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists warehouses_insert on public.warehouses;
create policy warehouses_insert on public.warehouses for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists warehouses_update on public.warehouses;
create policy warehouses_update on public.warehouses for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists payroll_runs_insert on public.payroll_runs;
create policy payroll_runs_insert on public.payroll_runs for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));
drop policy if exists payroll_runs_update on public.payroll_runs;
create policy payroll_runs_update on public.payroll_runs for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists payroll_items_insert on public.payroll_items;
create policy payroll_items_insert on public.payroll_items for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));
drop policy if exists payroll_items_update on public.payroll_items;
create policy payroll_items_update on public.payroll_items for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists sales_invoice_lines_insert on public.sales_invoice_lines;
create policy sales_invoice_lines_insert on public.sales_invoice_lines for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists sales_invoice_lines_update on public.sales_invoice_lines;
create policy sales_invoice_lines_update on public.sales_invoice_lines for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists purchase_invoice_lines_insert on public.purchase_invoice_lines;
create policy purchase_invoice_lines_insert on public.purchase_invoice_lines for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists purchase_invoice_lines_update on public.purchase_invoice_lines;
create policy purchase_invoice_lines_update on public.purchase_invoice_lines for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists bank_account_opening_balances_insert on public.bank_account_opening_balances;
create policy bank_account_opening_balances_insert on public.bank_account_opening_balances for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));
drop policy if exists bank_account_opening_balances_update on public.bank_account_opening_balances;
create policy bank_account_opening_balances_update on public.bank_account_opening_balances for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists opening_balance_proposals_insert on public.opening_balance_proposals;
create policy opening_balance_proposals_insert on public.opening_balance_proposals for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists opening_balance_proposals_update on public.opening_balance_proposals;
create policy opening_balance_proposals_update on public.opening_balance_proposals for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists source_observations_insert on public.source_observations;
create policy source_observations_insert on public.source_observations for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists source_observations_update on public.source_observations;
create policy source_observations_update on public.source_observations for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));

drop policy if exists management_questions_insert on public.management_questions;
create policy management_questions_insert on public.management_questions for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));
drop policy if exists management_questions_update on public.management_questions;
create policy management_questions_update on public.management_questions for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant']::text[]));

drop policy if exists inventory_movements_insert on public.inventory_movements;
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
drop policy if exists inventory_movements_update on public.inventory_movements;
create policy inventory_movements_update on public.inventory_movements for update to authenticated
  using (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]))
  with check (public.fz_is_company_member(company_id) and public.fz_has_role(company_id,array['owner','accountant','importer']::text[]));
