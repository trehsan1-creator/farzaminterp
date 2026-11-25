# STAGE 00 — Completion Report

**Scope:** minimum technical foundation to reconstruct and import Ati
Farzam's FY1404 financial history. No full ERP modules, no historical
data posting.
**Branch:** `arena/8b31927d-farzaminterp` · **Date:** 2026-11-25

---

## 1. Behavior delivered

### Application foundation
- Next.js 16 (App Router) + React 19 + TypeScript 5.9 modular monolith
  under `src/`, configured for Supabase PostgreSQL/Auth/Storage.
- Persian RTL-native shell: `lang="fa" dir="rtl"`, logical CSS properties,
  responsive app shell (persistent sidebar ≥768px, accessible drawer below),
  top bar with company context and an **explicit fiscal-year selector**
  (no date-based defaults).
- Original Peyda WOFF2 fonts self-hosted via `next/font/local`
  (all five files hash-verified against `design-system/ASSET_MANIFEST.md`);
  canonical `design-system/tokens.css` imported unmodified as the token
  source.

### Financial database foundation (11 versioned migrations)
- All 20 required domains + `company_members` (RLS basis):
  companies, fiscal_years, fiscal_periods, chart_of_accounts,
  counterparties, bank_accounts, documents, import_batches,
  import_source_files, import_staging_records, bank_transactions,
  sales_invoices, purchase_invoices, tax_returns, fixed_assets,
  journal_entries, journal_entry_lines, reconciliation_items, approvals,
  audit_events.
- Constraints as business rules: FKs, per-FY content-hash uniques,
  scope triggers (company↔FY↔date), append-only audit, forward-only
  approvals, approval-gated FY closing, balance-validated journal posting,
  posted-entry immutability with controlled reversal.
- Money: `NUMERIC(20,0)` + explicit `IRR`/`IRT` everywhere. Dates:
  canonical ISO `date`, Jalali display-only.
- RLS enabled on every table with a role matrix (viewer/importer/
  accountant/owner); `anon` fully revoked.
- Idempotent structural seed: company + FY1404 (`open`, reconstruction)
  + the 12 calendar periods of 1404. **No financial data seeded.**

### FY1404 import architecture (`src/modules/imports/`)
- Nine-stage pipeline exactly as specified (registration → hash
  verification → batch creation → raw preservation → normalization →
  staging validation → duplicate detection → reconciliation → authorized
  posting), orchestrated by `runImportPipeline()` with repository
  interfaces (in-memory for tests, Supabase for production).
- Idempotency: same bytes + FY + pipeline version ⇒ same source file,
  same batch (`idempotency_key`), same staging rows; posted state never
  reset; re-posting a posted batch is a no-op with zero duplicates.
- Hash mismatch aborts before any write; raw source files are immutable.
- Normalization never invents data: missing date/amount/currency become
  explicit exception-queue errors; currency only from explicit tokens or
  an operator declaration — never magnitude.
- Reconciliation: declared totals vs parsed actuals; undeclared totals ⇒
  explicit `partial` status (never fabricated).
- Approval-gated, idempotent `post_import_batch` SQL routine.

### Financial integrity
- Double-entry enforced per currency at the posting gate; ≥2 lines;
  exact integer amounts; cross-currency netting impossible.
- Fiscal years independent: scope triggers + domain guards + RLS +
  explicit `?fy=` selection; cross-year views are read-only by contract.
- Source-document provenance preserved (batch, source file, staging row,
  actor, timestamps, approval ids) on every import-sourced record.
- FY1404 seeded open; closing requires an approved approval (tested
  structurally).

### Initial UI (Persian, responsive, design-system based)
| Route | Screen |
|---|---|
| `/` | Company dashboard shell + FY-scoped KPI cards (honest zeros/empty states) |
| `/documents` | FY1404 document registry (financial table contract, mobile scroll region) |
| `/imports` | Import batch monitor + pipeline stage legend |
| `/imports/review` | Financial import review: stepper, source-file hash, reconciliation summary, staging rows, batch exceptions, approval-gated posting controls |
| `/validation` | Data validation & exception queue with severity filters |

All screens handle unconfigured-database, no-company, no-FY,
no-selection, empty, and error states. **No fake records are ever
rendered** — the dashboard shows `۰` only when the count is truly zero.

### Muse integration preparation
- Versioned `src/api/v1/` contracts (zod) + routes: health, fiscal-years,
  documents, import-batches (read) and idempotent import batch
  registration (write boundary stub).
- Timing-safe API-key gate with `NOT_CONFIGURED` (503) while
  `MUSE_API_KEY` is empty — **no credential created**; no DB access for
  Muse; documented in `docs/API_V1.md`.

## 2. Files and migrations changed

- Migrations: `supabase/migrations/20261125000001..00011` (11 files) +
  `supabase/config.toml`
- App scaffold: `package.json`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Source: `src/app/` (root layout, fonts, globals, 5 screens, 5 API
  routes), `src/components/` (shell, ui), `src/lib/` (money, jalali,
  display, env, supabase), `src/modules/` (imports pipeline,
  accounting/journal validation, fiscal isolation, queries),
  `src/api/v1/contracts.ts`, `src/db/types.ts`
- Assets: `public/brand/` (copies of official SVGs for serving)
- Tests: `tests/` (7 files, 83 tests)
- Docs: `docs/IMPORT_PIPELINE.md`, `docs/MIGRATIONS.md`,
  `docs/API_V1.md`, `docs/STAGE00_REPORT.md`; `README.md` updated

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Tests | `npm test` | ✅ 7 files, **83/83 passed** |
| Build | `npm run build` | ✅ all routes compiled |
| Smoke test | `next start` + curl | ✅ 5 screens + health API return 200 with RTL/Persian content and honest empty states; Muse API answers 503 NOT_CONFIGURED without a key |
| Font hashes | `sha256sum assets/fonts/*` | ✅ match ASSET_MANIFEST |

Test coverage of required areas:
- **Fiscal-year isolation** — `tests/fiscal-isolation.test.ts` (9) +
  journal date/FY gates in `tests/journal-balance.test.ts`;
- **Idempotency** — `tests/import-idempotency.test.ts` (11): re-import,
  hash-mismatch abort, approval gate, post/re-post no-op, duplicate
  content, blocking validation, declared-totals reconciliation;
- **Journal balancing** — `tests/journal-balance.test.ts` (9):
  per-currency balance, no cross-currency netting, line/date/FY gates;
- **Migration structure** — `tests/migrations-structure.test.ts` (12):
  tables, RLS, numeric-only money, triggers, idempotency anchors, seed
  restrictions;
- **API contracts** — `tests/api-contracts.test.ts` (10): integer-string
  money, explicit fiscal-year scope, registration schema.

## 4. Deployment / environment impact

- No deployment performed; no environment variables set; no secrets
  committed (`.env.example` only).
- The **Supabase app is not connected** in this session — migrations are
  written and structurally tested but **not applied to a live project**.
  Live-DB verification steps are listed in `docs/MIGRATIONS.md`.
- Vercel deployment remains gated by the company's data-residency
  approval (README release gate). Preview must use non-production
  Supabase credentials.

## 5. What remains (deliberately out of Stage 00)

1. **Live database**: connect Supabase, apply migrations, run the
   integration checklist (triggers, RLS allow/deny, posting routine),
   generate DB types to replace `src/db/types.ts`.
2. **Supabase Auth UI**: login/membership screens; until then server
   queries use the service role and RLS is enforced for authenticated
   API users (tested live pending step 1).
3. **Approval workflow UI**: create/decide approvals; posting buttons on
   the review screen are present but disabled until then.
4. **Pipeline execution endpoint** (`POST /api/v1/import/batches/{id}/run`)
   and private-storage upload flow wiring.
5. **Chart of accounts import** for FY1404 (not seeded — structure would
   be invented otherwise).
6. **Full ERP modules** (accounting, treasury, sales, purchases, assets,
   tax, payroll, inventory, reports) — explicitly deferred.
7. **Responsive visual QA at 320/375/768/1024/1440 px** in a real
   browser: Playwright browsers cannot be downloaded in this sandbox;
   markup/styles are mobile-first and follow `design-system/RESPONSIVE.md`
   but pixel-level verification is still owed.
8. **Real FY1404 source files**: none imported; no financial data exists
   anywhere yet (by design).

## 6. Approvals / decisions needed from the owner

1. Data-hosting region for Supabase + Vercel (release gate for real data).
2. Connect the Supabase app (or provide a project) so migrations can be
   applied and live-DB tests run.
3. Provisioning of `MUSE_API_KEY` (kept empty until explicitly requested).
4. Owner user bootstrap: add the owner's Auth user to `company_members`
   as `owner` (service-side one-time step documented with migration 0011).
5. Confirmation of the FY1404 chart-of-accounts source before any account
   rows are created.

---
**Stage 00 stops here.** No full accounting modules were started and no
historical data was posted.
