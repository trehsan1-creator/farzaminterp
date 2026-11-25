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

The repository is currently at the foundation/specification stage. Do not assume the application has already been scaffolded.

## Start here
1. Read [AGENTS.md](./AGENTS.md) for repository-wide engineering, financial integrity, security, integration, testing, and deployment rules.
2. Read [Design System](./design-system/README.md) before implementing any UI.
3. Read [Asset Manifest](./design-system/ASSET_MANIFEST.md) for the official brand files and the exact Peyda font package.
4. Review the approved architecture/product decisions before introducing schema, API, or deployment changes.

## Repository map
- `AGENTS.md` — repository-wide instructions for coding agents.
- `design-system/` — UI tokens, typography, responsive rules, RTL/locale, components, accessibility, and examples.
- `assets/brand/` — official logo and wordmark SVGs.
- `assets/fonts/` — destination for the original Peyda WOFF2 files.
- `scripts/import-brand-assets.ps1` — imports the supplied original brand archive and verifies font hashes.

## Important release gate
Do not use real company financial data in a production or external cloud environment until the company has explicitly approved the data-hosting region and data flows. Preview environments must use separate non-production credentials and data.
