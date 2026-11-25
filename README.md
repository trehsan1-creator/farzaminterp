# Farzam ERP

Farzam ERP is the planned financial and operational system of record for Ati Farzam. The product is intended to manage independent fiscal-year workspaces, reconstruct the complete FY1404 financial dossier, support ongoing financial operations, and integrate with PIP/Muse agents and the existing Farzam Bot v2 Telegram gateway.

## Product principles
- Independent financial records and documents for each fiscal year.
- FY1404 reconstruction and evidence-backed review as the first major business objective.
- Persian-first, RTL-native experience with Jalali date display.
- Rial as the default base currency; never silently convert Rial and Toman.
- Traceable records, controlled approvals, immutable audit history, and strict permissions.
- PIP/Muse works through documented APIs; it does not connect directly to the database.
- Fully responsive UI, including usable mobile workflows.

## Target technical direction
- Next.js App Router + TypeScript
- PostgreSQL via Supabase
- Supabase Auth, Row Level Security, and private Storage
- Vercel for initial web hosting, subject to company data-residency approval
- Modular monolith for the initial product; avoid premature microservices

## Start here
1. Read [AGENTS.md](./AGENTS.md) for repository-wide engineering, financial integrity, security, integration, testing, and deployment rules.
2. Read [Design System](./design-system/README.md) before implementing any UI.
3. Read [Asset Manifest](./design-system/ASSET_MANIFEST.md) for the official brand files and the exact Peyda font package.
4. Review the approved architecture/product decisions before introducing schema, API, or deployment changes.

## Stage 00 foundation (implemented)

The application scaffold, financial schema, FY1404 import pipeline
architecture, initial Persian RTL screens, and tests now exist:

```bash
npm install
npm run dev        # http://localhost:3000 (screens show honest empty
                   # states until Supabase is configured)
npm test           # fiscal isolation, idempotency, journal balancing,
                   # migration structure, API contracts
npm run typecheck && npm run lint && npm run build
```

Database setup (separately controlled step):

```bash
cp .env.example .env.local   # fill Supabase values (never commit them)
supabase db push             # applies supabase/migrations in order
```

See [docs/STAGE00_REPORT.md](./docs/STAGE00_REPORT.md) for what is
implemented and what remains, [docs/MIGRATIONS.md](./docs/MIGRATIONS.md)
for schema review notes, [docs/IMPORT_PIPELINE.md](./docs/IMPORT_PIPELINE.md)
for the idempotent import architecture,
[docs/API_V1.md](./docs/API_V1.md) for the versioned Muse API boundary, and
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for Vercel deployment
(`vercel.json` is included).

## Repository map
- `AGENTS.md` — repository-wide instructions for coding agents.
- `design-system/` — UI tokens, typography, responsive rules, RTL/locale, components, accessibility, and examples.
- `assets/brand/` — official logo and wordmark SVGs.
- `assets/fonts/` — original Peyda WOFF2 files (hash-verified, self-hosted).
- `scripts/import-brand-assets.ps1` — imports the supplied original brand archive and verifies font hashes.
- `src/` — Next.js App Router application (shell, screens, API v1, domain modules).
- `supabase/migrations/` — versioned financial schema migrations + structural seed.
- `tests/` — Vitest suite (fiscal isolation, idempotency, journal balancing, migrations, contracts).
- `docs/` — stage reports, migration review notes, import pipeline and API contracts.

## Important release gate
Do not use real company financial data in a production or external cloud environment until the company has explicitly approved the data-hosting region and data flows. Preview environments must use separate non-production credentials and data.
