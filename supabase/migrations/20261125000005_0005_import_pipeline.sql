-- ============================================================================
-- 0005 — Import pipeline: source files, batches, staging records, issues
-- Farzam ERP / Stage 00
--
-- Stage model (repeatable, idempotent pipeline):
--   1. source file registration   (import_source_files, unique per sha256)
--   2. file hash verification     (sha256 recomputed by the pipeline)
--   3. import batch creation      (import_batches.idempotency_key unique)
--   4. raw source preservation    (private storage + raw_preserved flag)
--   5. data normalization         (import_staging_records.payload -> normalized)
--   6. staging validation         (validation_status + import_validation_issues)
--   7. duplicate detection        (line hashes + content hashes vs. posted data)
--   8. reconciliation             (reconciliation_summary vs. expected_totals)
--   9. authorized posting         (approval required; see post_import_batch)
--
-- Idempotency contract:
--   * Same bytes + same company  -> same import_source_files row (sha256).
--   * Same file + fiscal year + pipeline version -> same batch (idempotency_key).
--   * Same row within a batch    -> same staging row (source_line_hash).
--   * Re-posting a posted batch  -> no-op (post_import_batch is idempotent).
-- Raw source bytes are immutable once registered; only preservation state
-- may change. Never modify original source files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- import_source_files — registration + hash verification of raw inputs
-- ---------------------------------------------------------------------------
create table if not exists import_source_files (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete restrict,
  original_filename text not null check (length(btrim(original_filename)) > 0),
  storage_bucket    text not null,
  storage_path      text not null,
  content_sha256    text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size         bigint not null check (byte_size > 0),
  mime_type         text,
  registered_by     uuid references auth.users(id) on delete set null,
  registered_at     timestamptz not null default now(),
  raw_preserved     boolean not null default false,
  preserved_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint source_file_preserved_consistency check (
    (raw_preserved = false and preserved_at is null)
    or (raw_preserved = true and preserved_at is not null)
  )
);

comment on table import_source_files is
  'Registered raw source files. content_sha256 is the idempotency anchor; bytes live in a private Storage bucket and are never modified.';

-- Idempotent registration: the same bytes may only be registered once per company.
create unique index if not exists uq_import_source_files_company_hash
  on import_source_files(company_id, content_sha256);

create trigger import_source_files_touch_updated_at
  before update on import_source_files
  for each row execute function fz_touch_updated_at();

-- Raw provenance is immutable: only preservation state may change.
create or replace function fz_assert_source_file_immutable() returns trigger
language plpgsql as $$
begin
  if new.company_id is distinct from old.company_id
     or new.content_sha256 is distinct from old.content_sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.original_filename is distinct from old.original_filename
     or new.byte_size is distinct from old.byte_size then
    raise exception 'SOURCE_FILE_IMMUTABLE'
      using message = 'registered source file identity and hash cannot be modified';
  end if;
  if new.raw_preserved and not old.raw_preserved then
    new.preserved_at := coalesce(new.preserved_at, now());
  end if;
  if new.raw_preserved is distinct from old.raw_preserved and not new.raw_preserved then
    raise exception 'SOURCE_FILE_PRESERVATION_REVERSIBLE'
      using message = 'raw preservation cannot be revoked';
  end if;
  return new;
end;
$$;

create trigger import_source_files_immutable
  before update on import_source_files
  for each row execute function fz_assert_source_file_immutable();

-- ---------------------------------------------------------------------------
-- import_batches — one idempotent run of a pipeline version over one file
-- ---------------------------------------------------------------------------
create table if not exists import_batches (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete restrict,
  fiscal_year_id    uuid not null references fiscal_years(id) on delete restrict,
  source_file_id    uuid not null references import_source_files(id) on delete restrict,
  pipeline_version  text not null check (length(btrim(pipeline_version)) > 0),
  -- sha256(company | fiscal_year | source_sha256 | pipeline_version)
  idempotency_key   text not null unique check (idempotency_key ~ '^[0-9a-f]{64}$'),
  status            fz_import_status not null default 'created',
  stage             fz_import_stage not null default 'source_registered',
  -- Explicitly declared expectations from the source header (never inferred).
  -- e.g. {"rows": 120, "total_amount": "4200000000", "currency": "IRR"}
  expected_totals   jsonb,
  reconciliation_summary jsonb,
  stats             jsonb not null default '{}'::jsonb,
  error_summary     text,
  approval_id       uuid references approvals(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  posted_at         timestamptz,
  posted_by         uuid references auth.users(id) on delete set null
);

comment on table import_batches is
  'Idempotent import runs. Re-importing identical bytes for the same fiscal year and pipeline version resolves to the same batch.';

create index if not exists idx_import_batches_company_fy
  on import_batches(company_id, fiscal_year_id, created_at desc);
create index if not exists idx_import_batches_status
  on import_batches(status, stage);

create trigger import_batches_touch_updated_at
  before update on import_batches
  for each row execute function fz_touch_updated_at();

create trigger import_batches_fy_scope
  before insert or update on import_batches
  for each row execute function fz_trigger_assert_fy_scope();

-- ---------------------------------------------------------------------------
-- import_staging_records — normalized + validated rows awaiting authorized posting
-- ---------------------------------------------------------------------------
create table if not exists import_staging_records (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete restrict,
  fiscal_year_id        uuid not null references fiscal_years(id) on delete restrict,
  import_batch_id       uuid not null references import_batches(id) on delete cascade,
  record_kind           fz_record_kind not null,
  source_row_no         int not null check (source_row_no > 0),
  -- sha256 of the canonicalized raw row: stable across re-imports of the file
  source_line_hash      text not null check (source_line_hash ~ '^[0-9a-f]{64}$'),
  -- verbatim source fields (raw preservation at row level)
  payload               jsonb not null,
  -- normalized, type-checked fields; amounts are integer strings, dates ISO
  normalized            jsonb not null default '{}'::jsonb,
  validation_status     fz_validation_status not null default 'pending',
  validation_errors     jsonb not null default '[]'::jsonb,
  duplicate_status      fz_duplicate_status not null default 'unknown',
  duplicate_of_document_id uuid,
  post_status           fz_post_status not null default 'pending',
  posted_document_id    uuid,
  posted_journal_entry_id uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (import_batch_id, source_row_no),
  unique (import_batch_id, source_line_hash),
  constraint staging_posted_consistency check (
    (post_status = 'posted' and (posted_document_id is not null or posted_journal_entry_id is not null))
    or post_status <> 'posted'
  )
);

comment on table import_staging_records is
  'Holding area between raw source and financial records. Nothing here is a posted financial fact.';

create index if not exists idx_staging_batch_status
  on import_staging_records(import_batch_id, validation_status);
create index if not exists idx_staging_company_fy
  on import_staging_records(company_id, fiscal_year_id);
create index if not exists idx_staging_duplicate_doc
  on import_staging_records(duplicate_of_document_id)
  where duplicate_of_document_id is not null;

create trigger import_staging_records_touch_updated_at
  before update on import_staging_records
  for each row execute function fz_touch_updated_at();

create trigger import_staging_records_fy_scope
  before insert or update on import_staging_records
  for each row execute function fz_trigger_assert_fy_scope();

-- ---------------------------------------------------------------------------
-- import_validation_issues — data validation & exception queue
-- ---------------------------------------------------------------------------
create table if not exists import_validation_issues (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  fiscal_year_id      uuid references fiscal_years(id) on delete restrict,
  import_batch_id     uuid references import_batches(id) on delete cascade,
  staging_record_id   uuid references import_staging_records(id) on delete cascade,
  source_ref          text,
  severity            fz_issue_severity not null,
  code                text not null check (length(btrim(code)) > 0),
  message_fa          text not null check (length(btrim(message_fa)) > 0),
  field               text,
  details             jsonb not null default '{}'::jsonb,
  status              fz_issue_status not null default 'open',
  resolved_by         uuid references auth.users(id) on delete set null,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table import_validation_issues is
  'Exception queue. Uncertain or invalid source data is routed here; it is never silently fixed or invented.';

create index if not exists idx_issues_queue
  on import_validation_issues(company_id, status, severity, created_at desc);
create index if not exists idx_issues_batch
  on import_validation_issues(import_batch_id, status, severity);
create index if not exists idx_issues_staging
  on import_validation_issues(staging_record_id);

create trigger import_validation_issues_touch_updated_at
  before update on import_validation_issues
  for each row execute function fz_touch_updated_at();

create trigger import_validation_issues_fy_scope
  before insert or update on import_validation_issues
  for each row execute function fz_trigger_assert_fy_scope();
