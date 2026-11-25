# Database Migrations — Review Notes

All schema changes live in `supabase/migrations/` as versioned, ordered
files. Never edit an applied migration; add a new one. Apply with the
Supabase CLI (`supabase db push`) or by running the files in order on the
target project. Migrations are a separately controlled deployment step
(AGENTS.md §10).

## Index

| File | Contents |
|---|---|
| `20261125000001_0001_extensions_and_enums.sql` | pgcrypto, shared enum types, `updated_at` trigger |
| `20261125000002_0002_companies_and_fiscal.sql` | `companies`, `company_members`, `fiscal_years`, `fiscal_periods`, member predicates, scope assertions, guarded `auth.uid()` shim (no-op on Supabase) |
| `20261125000003_0003_governance.sql` | `approvals` (forward-only decisions), `audit_events` (append-only), approval-gated FY closing |
| `20261125000004_0004_master_data.sql` | `chart_of_accounts` (per fiscal year), `counterparties`, `bank_accounts` |
| `20261125000005_0005_import_pipeline.sql` | `import_source_files`, `import_batches`, `import_staging_records`, `import_validation_issues` + immutability/idempotency constraints |
| `20261125000006_0006_documents.sql` | `documents` registry + staging back-references |
| `20261125000007_0007_operational_transactions.sql` | `bank_transactions`, `sales_invoices`, `purchase_invoices`, `tax_returns`, `fixed_assets` |
| `20261125000008_0008_journal.sql` | `journal_entries`, `journal_entry_lines`, balance/immutability/status gates, `reverse_journal_entry`, `post_journal_entry`, `post_import_batch` |
| `20261125000009_0009_reconciliation.sql` | `reconciliation_items` |
| `20261125000010_0010_rls.sql` | RLS enable + policies + grants for every business table |
| `20261125000011_0011_seed_foundation.sql` | Idempotent structural seed only: company + FY1404 (open, reconstruction) + the 12 calendar periods of 1404 |

## Financial integrity decisions (enforced in SQL)

1. **Money** — every amount is `NUMERIC(20, 0)` (exact integers) with an
   adjacent `currency char(3)` check-constrained to `IRR`/`IRT`. No
   `float`, `real`, `double precision` or `money` types anywhere.
   Magnitude never implies a unit.
2. **Dates** — canonical storage is the Gregorian `date`; Jalali is
   display-only (`src/lib/jalali.ts`). Missing dates stay `NULL` and are
   flagged by validation; they are never invented.
3. **Fiscal isolation** — every financial table carries
   `company_id` + `fiscal_year_id` with an `fz_assert_fy_scope` trigger;
   dated tables additionally run `fz_assert_date_in_fy`. Journal entries,
   documents, bank transactions and invoices reject out-of-year dates.
4. **Double entry** — `fz_assert_entry_balanced` requires ≥ 2 lines and
   per-currency debits = credits before any `draft → posted` transition
   (`fz_assert_journal_entry_status`). Drafts may be built across multiple
   transactions; the posting gate is the hard boundary.
5. **Posted immutability** — lines of `posted`/`reversed` entries reject
   INSERT/UPDATE/DELETE; posted entries reject content edits and
   un-posting; corrections go through `reverse_journal_entry`.
6. **FY closing** — `fiscal_years.status = 'closed'` requires an approved
   `close_fiscal_year` approval (FY1404 is seeded `open` and must stay
   open until explicitly approved).
7. **Audit** — `audit_events` rejects UPDATE/DELETE outright.
8. **Approvals** — `pending → approved|rejected` once; decisions immutable.
9. **Idempotency** — unique anchors documented in `docs/IMPORT_PIPELINE.md`.

## RLS policy matrix

Predicates: `fz_is_company_member(company_id)`,
`fz_has_role(company_id, roles)` (security-definer, `auth.uid()` based).
No DELETE policies exist in Stage 00 for financial tables; journal lines
allow DELETE only while the parent entry is a `draft` (DB trigger still
forbids touching posted/reversed lines).

| Table group | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `companies` | member | — (service-side) | — (service-side) | — |
| `company_members` | self or owner | self or owner | owner | — |
| `fiscal_years` | member | — (service-side) | owner (close still approval-gated) | — |
| `approvals` | member | owner, accountant | owner (decide) | — |
| `audit_events` | member | owner, accountant, importer | — (append-only trigger) | — |
| import tables + `documents` | member | owner, accountant, importer | owner, accountant, importer | — |
| other financial tables | member | owner, accountant | owner, accountant | — |
| `journal_entry_lines` | via parent entry | owner, accountant (parent draft) | owner, accountant (parent draft) | owner, accountant (parent draft) |

`anon` is revoked from all tables and functions. `service_role` (server
only) bypasses RLS for controlled pipelines; the browser never holds
privileged keys.

## Review status

- ✅ Structural review automated in `tests/migrations-structure.test.ts`
  (tables, RLS enablement, numeric-only money, trigger/function presence,
  idempotency anchors, seed restrictions).
- ⏳ **Pending live-DB verification** (requires a Supabase project; the
  Supabase app is currently disconnected in this session):
  - `supabase db push` applies all 11 migrations cleanly in order;
  - trigger behavior tests: unbalanced journal insert blocked, posted
    line edit blocked, out-of-FY date blocked, FY close without approval
    blocked;
  - RLS tests: viewer can select but not write; cross-company reads
    denied for `authenticated` without membership;
  - `post_import_batch` happy path + re-post no-op + missing-approval
    rejection;
  - generated types (`supabase gen types typescript`) replace the
    hand-written `src/db/types.ts`.

## Rollback / recovery

Migrations are forward-only in Stage 00 (no destructive drops; seeds use
`ON CONFLICT DO NOTHING`). To rebuild a scratch database, drop the schema
and re-apply from `0001`. For production incidents, restore from backup
rather than editing schema manually (AGENTS.md §5).

## Data-impact notes

- `0011` inserts reference data only (company, FY1404, calendar periods).
  It contains **no** financial records, amounts, opening balances, or
  chart-of-accounts rows.
- No migration modifies or deletes source files or existing financial
  data (none exists yet).
