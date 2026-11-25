-- ============================================================================
-- 0006 — documents: the FY document registry
-- Farzam ERP / Stage 00
--
-- A document is the registry entry for a source-backed financial artifact
-- (manual or imported). Documents are provenance carriers: import-sourced
-- rows reference their import batch and source file. Posted documents are
-- never deleted through ordinary flows (no delete path exists at RLS level;
-- status 'void' marks cancellation with history preserved).
-- Missing dates are stored as NULL and flagged — never invented.
-- ============================================================================

create table if not exists documents (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete restrict,
  fiscal_year_id        uuid not null references fiscal_years(id) on delete restrict,
  document_type         fz_document_type not null,
  document_no           text,
  -- canonical Gregorian ISO date; NULL when the source does not state one
  document_date         date,
  counterparty_id       uuid references counterparties(id) on delete restrict,
  description           text,
  currency              char(3) not null default 'IRR'
                          check (currency in ('IRR', 'IRT')),
  amount_total          numeric(20, 0),
  status                fz_document_status not null default 'registered',
  source                text not null default 'manual'
                          check (source in ('manual', 'import')),
  -- provenance (import-sourced documents)
  import_batch_id       uuid references import_batches(id) on delete restrict,
  import_source_file_id uuid references import_source_files(id) on delete restrict,
  staging_record_id     uuid,
  -- content hash over canonical business fields; anchors idempotent imports
  content_hash          text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  storage_bucket        text,
  storage_path          text,
  created_by            uuid references auth.users(id) on delete set null,
  posted_at             timestamptz,
  posted_by             uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint documents_import_consistency check (
    (source = 'import' and import_batch_id is not null)
    or (source = 'manual' and import_batch_id is null)
  )
);

comment on table documents is
  'FY document registry. Provenance (batch, source file, staging row, actor, timestamps) is preserved on every import-sourced row.';

comment on column documents.document_date is
  'Canonical Gregorian ISO date. Jalali is computed for display only. NULL = not stated by the source (flagged, never invented).';

-- Idempotent import anchor: identical business content may exist once per
-- (company, fiscal year, type). Re-import conflicts resolve to the existing row.
create unique index if not exists uq_documents_content_hash
  on documents(company_id, fiscal_year_id, document_type, content_hash)
  where content_hash is not null;

create index if not exists idx_documents_registry
  on documents(company_id, fiscal_year_id, document_date desc nulls last);
create index if not exists idx_documents_batch
  on documents(import_batch_id);
create index if not exists idx_documents_status
  on documents(company_id, fiscal_year_id, status);

create trigger documents_touch_updated_at
  before update on documents
  for each row execute function fz_touch_updated_at();

-- Fiscal-year isolation: company must match the FY, and a stated document
-- date must fall inside the fiscal year.
create or replace function fz_assert_document_scope() returns trigger
language plpgsql as $$
begin
  perform fz_assert_fy_scope(new.company_id, new.fiscal_year_id);
  perform fz_assert_date_in_fy(new.fiscal_year_id, new.document_date);
  if new.source = 'import' and new.import_batch_id is null then
    raise exception 'DOCUMENT_IMPORT_PROVENANCE_REQUIRED'
      using message = 'import-sourced documents must reference their import batch';
  end if;
  return new;
end;
$$;

create trigger documents_scope
  before insert or update on documents
  for each row execute function fz_assert_document_scope();

-- ---------------------------------------------------------------------------
-- Back-reference from staging rows to the documents they produced
-- (added here because documents did not exist when staging was created).
-- ---------------------------------------------------------------------------
alter table import_staging_records
  add constraint fk_staging_posted_document
  foreign key (posted_document_id) references documents(id)
  on delete restrict;

alter table import_staging_records
  add constraint fk_staging_duplicate_document
  foreign key (duplicate_of_document_id) references documents(id)
  on delete restrict;
