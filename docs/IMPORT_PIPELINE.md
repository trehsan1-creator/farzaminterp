# FY1404 Import Pipeline — Architecture

Stage 00 implementation of the repeatable, idempotent import pipeline.
Code: `src/modules/imports/` · Schema: `supabase/migrations/20261125000005_0005_import_pipeline.sql`
· Posting routine: `...0008_journal.sql` (`post_import_batch`) ·
Tests: `tests/import-idempotency.test.ts`.

## Pipeline stages

| # | Stage (requirement name) | DB `stage` value | Implementation |
|---|---|---|---|
| 1 | Source file registration | `source_registered` | `SourceFileRepo.register` — unique per `(company_id, content_sha256)` |
| 2 | File hash verification | `hash_verified` | `sha256(bytes)` recomputed; a declared hash that mismatches aborts **before any write** |
| 3 | Import batch creation | `source_registered` | `computeIdempotencyKey()` → unique `import_batches.idempotency_key` |
| 4 | Raw source preservation | `raw_preserved` | private Storage bucket + `raw_preserved` flag; registered file identity is immutable (`SOURCE_FILE_IMMUTABLE`) |
| 5 | Data normalization | `normalized` | `normalize.ts` — digits, Jalali/ISO dates, exact integer amounts, explicit currency |
| 6 | Staging validation | `validated` | `validate.ts` — rules → `import_validation_issues` (exception queue) |
| 7 | Duplicate detection | `duplicates_detected` | `duplicates.ts` — within-batch content hash + against posted records |
| 8 | Reconciliation | `reconciled` | `reconcile.ts` — declared expectations vs. parsed actuals |
| 9 | Authorized posting | `posting` → `posted` | `authorizeAndPost()` → `post_import_batch` RPC; requires an **approved** approval row |

`authorized_posting` is never part of the automatic run. It is a separate,
explicit, approval-gated call.

## Idempotency contract

```
source file   : unique (company_id, sha256(bytes))
batch         : sha256(company | fiscal_year | source_sha256 | pipeline_version)
staging row   : unique (import_batch_id, source_line_hash)
                source_line_hash = sha256(rowNo + fields + lines)
financial row : unique (company_id, fiscal_year_id, content_hash)
post routine  : re-running against a posted batch returns { already_posted: true }
```

Consequences (all covered by tests):

- Re-importing the identical file for the same fiscal year and pipeline
  version resolves to the **same** source file, batch and staging rows.
- `post_status`/`posted_*` columns are never touched by upserts, so a
  re-import can never reset or duplicate posted financial records.
- Different bytes → different hash → new file + new batch (by design).
- A different `pipeline_version` intentionally creates a new batch
  (versioned reprocessing).

## Record kinds and supported payloads (pipeline v1 = `fy1404-import@1`)

`POSTABLE_RECORD_KINDS = ['document', 'journal_candidate']`

- `document` — registry row: `document_type`, `document_no`, `date`,
  `amount`, `currency`, `description`.
- `journal_candidate` — double-entry draft: `date`, `memo`, `lines[]` with
  `account_code`, `side`, `amount` (integer string), optional per-line
  `currency`. Posting validates the chart of accounts of **that** fiscal
  year and the balance gate in migration 0008.
- All other kinds (bank/invoice/tax/asset) normalize and stage, but a
  pending row of an unsupported kind raises `UNSUPPORTED_KIND_PENDING` at
  posting time and is reported as a blocking validation error
  (`KIND_NOT_SUPPORTED`) — the batch never reaches `ready_to_post`
  silently.

CSV input uses a header row; supported columns include
`record_kind, date, amount, currency, document_type, document_no,
description, counterparty, reference, memo`. Structured sources may supply
`lines[]` directly.

## Normalization and validation rules

- Digits: Persian/Arabic-Indic normalized at the boundary.
- Dates: `YYYY/M/D` (Jalali) or `YYYY-MM-DD` (Gregorian) → canonical ISO
  storage. Unparseable → `DATE_INVALID`; absent → `DATE_MISSING`
  (**never invented**); outside FY → `DATE_OUTSIDE_FISCAL_YEAR`.
- Amounts: exact integers only (`AMOUNT_NOT_INTEGER` for decimals);
  serialized as integer strings end-to-end.
- Currency: taken only from an explicit token (`ریال`/`تومان`/`IRR`/`IRT`)
  or an operator-declared batch currency. Missing → `CURRENCY_MISSING`.
  **Magnitude is never used to guess the unit.**
- Journal candidates: ≥ 2 lines, known postable account code per line,
  per-currency debits = credits (`JOURNAL_UNBALANCED`).
- Reconciliation: declared totals/rows compared to parsed actuals;
  mismatch → blocking `IMPORT_TOTAL_MISMATCH` / `IMPORT_ROWS_MISMATCH`.
  No declared totals → `status: partial` + info `TOTALS_NOT_DECLARED`
  (totals are never invented).

Severity model: `error` blocks `ready_to_post`; `warning` (e.g. duplicates)
does not block — duplicates post once and are marked `skipped`;
`info` is informational.

## Approval-gated posting

`post_import_batch(p_batch_id, p_actor)` (SQL, migration 0008):

1. idempotent short-circuit when the batch is already `posted`;
2. requires an `approvals` row (`action='post_import_batch'`,
   `status='approved'`);
3. requires every staging row `valid` and zero open `error` issues;
4. creates journal entries/documents with `content_hash` conflict
   handling (`DO NOTHING` → existing row reused, staging marked `skipped`);
5. runs the journal balance/scope triggers on every created entry;
6. writes an `audit_events` row.

## Running the pipeline (server-side)

```ts
import { getServiceClient } from "@/lib/supabase/server";
import { createSupabasePipelineDeps } from "@/modules/imports/supabase-repositories";
import { runImportPipeline, authorizeAndPost } from "@/modules/imports/pipeline";

const client = getServiceClient();            // service role, server only
const deps = createSupabasePipelineDeps(client);
const report = await runImportPipeline({ /* input */ }, deps);
// ...human approval is created and decided through the approvals flow...
await authorizeAndPost({ batchId: report.batchId, actorUserId }, deps);
```

Unit tests exercise the identical orchestrator against
`createMemoryPipelineDeps()` (in-memory repositories) — see
`tests/import-idempotency.test.ts`.

## Known Stage 00 limitations

- HTTP entry point registers the source file + batch idempotently
  (`POST /api/v1/import/batches`); full pipeline execution over HTTP is
  wired in the next stage (the orchestrator currently runs server-side).
- Posting supports `document` and `journal_candidate` kinds only.
- Reconciliation compares declared row counts and one declared total
  currency; multi-currency declared totals are a later extension.
- Live-DB execution of the posting routine is pending a Supabase project
  (structural tests cover the SQL; integration tests are listed in
  `docs/MIGRATIONS.md`).
