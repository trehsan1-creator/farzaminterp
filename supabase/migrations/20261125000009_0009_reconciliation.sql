-- ============================================================================
-- 0009 — Reconciliation items
-- Farzam ERP / Stage 00
--
-- Cross-record matching work items (bank vs. documents, source totals vs.
-- staged totals, etc.). Differences are recorded, never silently absorbed.
-- ============================================================================

create table if not exists reconciliation_items (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete restrict,
  fiscal_year_id    uuid not null references fiscal_years(id) on delete restrict,
  import_batch_id   uuid references import_batches(id) on delete restrict,
  kind              text not null
                      check (kind in ('bank', 'document', 'invoice', 'journal',
                                      'tax', 'import_total', 'other')),
  left_label        text not null check (length(btrim(left_label)) > 0),
  left_ref_type     text,
  left_ref_id       uuid,
  right_label       text,
  right_ref_type    text,
  right_ref_id      uuid,
  amount            numeric(20, 0),
  difference        numeric(20, 0) not null default 0,
  currency          char(3) not null default 'IRR'
                      check (currency in ('IRR', 'IRT')),
  status            fz_reconciliation_status not null default 'open',
  notes             text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_at       timestamptz,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reconciliation_resolved_consistency check (
    (status in ('matched', 'resolved') and resolved_at is not null)
    or (status in ('open', 'disputed') and resolved_at is null)
  )
);

comment on table reconciliation_items is
  'Open reconciliation work items with recorded differences. Differences are surfaced for review — never silently zeroed.';

create index if not exists idx_reconciliation_queue
  on reconciliation_items(company_id, fiscal_year_id, status, created_at desc);
create index if not exists idx_reconciliation_batch
  on reconciliation_items(import_batch_id, status);

create trigger reconciliation_items_touch_updated_at
  before update on reconciliation_items
  for each row execute function fz_touch_updated_at();

create trigger reconciliation_items_fy_scope
  before insert or update on reconciliation_items
  for each row execute function fz_trigger_assert_fy_scope();
