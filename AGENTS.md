# AGENTS.md — Farzam ERP Repository Operating Rules

This file applies to the **entire repository**: product engineering, architecture, backend, database, security, integrations, testing, documentation, deployment, and UI. It is not a design-only instruction file.

The detailed visual and interaction specification is maintained separately in `design-system/`. These instructions govern the wider engineering work; the design system is authoritative specifically for user-facing UI.

## 1. Product context

Farzam ERP is the financial and operational system of record for Ati Farzam. The product is intended to support:
- independent fiscal-year workspaces, initially including 1403, 1404, and 1405;
- comprehensive reconstruction and review of fiscal year 1404;
- accounting, treasury, sales, purchases, expenses, petty cash, contracts/projects, payroll, assets, inventory, and tax workflows;
- document intake, extraction, reconciliation, reporting, and approvals;
- controlled integration with PIP/Muse agents and the existing Farzam Bot v2 Telegram gateway.

The default business interface is Persian and Jalali-calendar aware. The base currency is Rial unless a specific record explicitly identifies another unit. Never silently convert Rial and Toman.

## 2. Target architecture

The approved target direction is:
- Next.js App Router and TypeScript for the web application and server-side application/API layer;
- PostgreSQL through Supabase for persistent business data;
- Supabase Auth for user authentication;
- PostgreSQL Row Level Security and server-side authorization for access control;
- Supabase Storage for private business documents;
- Vercel for the initial web deployment, subject to the company's data-residency approval;
- PIP/Muse and Farzam Bot v2 as separately operated integrations using explicit, versioned API contracts.

Use a **modular monolith** initially. Keep domain modules and boundaries explicit without introducing microservices, Kubernetes, or unnecessary infrastructure for the MVP.

Before implementing, inspect the actual repository state, package manifests, existing decisions, and environment. Do not overwrite an existing scaffold, change framework versions, or introduce a competing architecture without explaining why and obtaining approval.

## 3. Engineering workflow

For every non-trivial task:
1. Inspect the relevant code, documentation, schema, and tests before editing.
2. State the intended scope and identify affected modules.
3. Make the smallest coherent change that satisfies the task.
4. Keep business logic out of presentation components.
5. Add or update tests for changed behavior.
6. Update relevant technical documentation and migration notes.
7. Report files changed, checks run, known gaps, and any action requiring owner approval.

Do not fabricate implementation status, test results, financial facts, or successful external actions. If something could not be verified, say so.

Avoid speculative abstractions and premature generalization. Prefer clear domain boundaries, typed interfaces, predictable errors, and maintainable code.

## 4. Financial data integrity — non-negotiable

- Every financial record must belong to an explicit company and fiscal year where applicable.
- Fiscal years are isolated operational contexts. Cross-year comparison is read-only analytics; it must not merge or mutate source-year records.
- Keep source documents and extracted/proposed data distinguishable from reviewed and posted financial facts.
- Preserve provenance: source document, import batch, actor/agent, timestamps, and relevant approval history.
- Use exact monetary representations. Never use JavaScript floating-point arithmetic for financial calculations. Persist amounts using an explicitly chosen exact PostgreSQL representation (integer minor/base units or NUMERIC with documented scale); never silently round.
- Store and display currency/unit explicitly. Do not infer Rial/Toman from the numeric magnitude.
- Use database transactions for multi-record financial operations.
- Posted accounting entries must balance. Do not edit posted journal lines in place; use controlled reversal/correction entries with audit history.
- Do not delete posted or approved financial records through ordinary UI flows.
- Imports must be idempotent or have duplicate-detection controls. Re-running an import must not silently duplicate financial facts.
- Never invent missing dates, amounts, counterparties, classifications, or accounting entries. Mark uncertainty and route it for review.
- Fiscal-year closing, opening balances, and cross-year carry-forward require explicit rules and authorized approval.

## 5. Database and migrations

- Treat PostgreSQL constraints as part of the business rules, not merely application validation.
- Use foreign keys, unique constraints, check constraints, indexes, and transactions where appropriate.
- Every schema change must be delivered as a versioned migration.
- Do not make undocumented manual production schema changes.
- Migrations must be reviewed for data impact, safe ordering, rollback/recovery implications, and index-lock risk.
- Keep generated database types synchronized with migrations.
- Apply least privilege to database roles and service credentials.
- RLS must be enabled and tested on every user-accessible business table. Never rely on client-side filtering as authorization.
- Test both permitted and denied access paths, including cross-company and cross-fiscal-year access where applicable.

## 6. Security and privacy

- Never commit secrets, tokens, private keys, service-role credentials, or real production environment files.
- Keep privileged Supabase keys server-side only. Never expose a service-role key in browser bundles.
- Private documents must use private buckets and authorized access or short-lived signed URLs.
- Validate and authorize every server action/API request independently.
- Apply input validation, output shaping, rate limits where appropriate, and safe error handling.
- Log security-relevant events without logging credentials, full sensitive documents, or unnecessary personal data.
- Separate development, preview/staging, and production environments and credentials.
- Do not put real company financial records into preview deployments or external AI services unless the company has explicitly approved the data flow and hosting region.
- Treat data residency as a release gate, not an assumption. Vercel/Supabase region choices must comply with the owner's and company's policy before real data is deployed.

## 7. PIP / Muse / Bot integration rules

- Integrations must use documented, versioned API contracts; do not let agents access the database directly.
- PIP/Muse may read permitted records, extract documents, classify, reconcile, draft entries, prepare reports, and create approval requests according to explicit scopes.
- Clearly distinguish AI suggestions, extracted values, reviewed values, and posted accounting facts.
- Human approval is required for sensitive or irreversible financial actions unless a later approved policy explicitly defines a safe delegated action.
- Every agent write must be authenticated, authorized, auditable, and attributable to an agent/task identity.
- Use idempotency keys or equivalent duplicate protection for retried writes.
- Long-running document/OCR/AI work must run as asynchronous jobs. Do not perform heavy processing inside short-lived request handlers.
- Job states, retries, failure reasons, source document IDs, and final outcomes must be observable.
- An agent must never claim a record was saved, a message was delivered, or an approval was completed until the relevant service confirms success.
- Farzam Bot v2 is a messaging gateway; it is not the financial system of record.

## 8. UI and design-system rules

For user-facing interfaces, read `design-system/README.md` and the relevant documents under `design-system/` before implementation.

- All screens must be fully responsive and mobile-first.
- Persian is the primary interface language and RTL must be structural.
- Use the supplied official brand assets and Peyda font files when present.
- Reuse design tokens and shared components; do not create unrelated per-page visual styles.
- Financial tables, amount inputs, Jalali date controls, approval flows, and PIP review components must follow the design-system contracts.
- Meet the accessibility requirements and never communicate status by color alone.
- Keep AI activity visually distinct from authoritative financial records.

## 9. Testing and quality gates

Use the test tooling already established by the project; do not add a competing test framework without reason.

At minimum, add tests appropriate to the change:
- unit tests for domain calculations, currency/date formatting, validation, and state transitions;
- integration tests for database constraints, transactions, authorization, and API contracts;
- import/idempotency tests for document and financial ingestion;
- responsive UI checks for 320px, 375px, 768px, 1024px, and 1440px;
- regression tests for fiscal-year isolation and permission boundaries.

Before declaring a task complete, run relevant lint, type-check, tests, and build commands when the repository is configured for them. Report commands that were not run and why.

## 10. Deployment and operations

- Use Vercel Preview deployments for review and Production deployments only from the approved production branch.
- Keep preview and production environment variables and Supabase projects separate.
- Never point preview builds at the production database.
- Treat database migrations as a separately controlled deployment step.
- Configure error monitoring, backups, restore procedures, and operational alerts before real financial operations go live.
- Verify Vercel Function region and database region proximity, but do not trade data-residency requirements for latency.
- Long-running work belongs in an external worker/agent runtime or durable queue, not a synchronous web request.

## 11. Completion report

Every implementation task should end with:
- a concise summary of behavior delivered;
- exact files and migrations changed;
- tests, type checks, lint, and build results;
- deployment/environment impact;
- known limitations and unresolved decisions;
- any approval needed from the owner.

If a request conflicts with these rules or the approved product decisions, stop and explain the conflict rather than silently weakening financial integrity, security, or data isolation.
