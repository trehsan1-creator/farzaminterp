# Database Migrations — Review Notes

All schema changes live in `supabase/migrations/` as ordered, versioned files. Never edit an applied migration; add a new one. The Supabase project is connected for this workspace. The live database was inspected during the Milestone A implementation and is currently at migration 0015; migration 0016 is the next forward-only change.

## Index

| File | Contents |
|---|---|
| `20261125000001_0001_extensions_and_enums.sql` | Extensions, shared enums, updated-at trigger |
| `20261125000002_0002_companies_and_fiscal.sql` | Companies, memberships, fiscal years/periods, scope helpers |
| `20261125000003_0003_governance.sql` | Approvals, append-only audit events, approval-gated FY close |
| `20261125000004_0004_master_data.sql` | Chart of accounts, counterparties, bank accounts |
| `20261125000005_0005_import_pipeline.sql` | Raw source registration, import batches, staging and validation |
| `20261125000006_0006_documents.sql` | Document registry |
| `20261125000007_0007_operational_transactions.sql` | Bank transactions, invoices, tax returns, fixed assets |
| `20261125000008_0008_journal.sql` | Double-entry journal, balance and posting gates, reversal |
| `20261125000009_0009_reconciliation.sql` | Reconciliation workspace |
| `20261125000010_0010_rls.sql` | RLS policies and table grants |
| `20261125000011_0011_seed_foundation.sql` | Company, FY1404 and its 12 calendar periods; no financial facts |
| `20261125000013_0013_operational_modules.sql` | Products, warehouses, inventory, employees, payroll, invoice lines, opening-balance proposals, source observations and management questions |
| `20261125000014_0014_agent_task_queue_and_rpc_hardening.sql` | Durable PIP task queue, idempotency receipts, append-only agent audit and owner policy |
| `20261125000015_0015_storage_and_security_hardening.sql` | Private source bucket, membership-helper isolation, task idempotency locking and indexes |
| `20261125000016_0016_schema_metadata_and_helper_grants.sql` | Source metadata fields and the minimal trigger-helper grants required by authenticated writes |

## Financial integrity

1. **Money:** monetary amounts use exact `NUMERIC(20,0)` values and explicit `IRR`/`IRT` currency. Quantity columns may use `NUMERIC(20,3)`; quantity is not money. Product and payroll-item fields ending in `_rial` explicitly represent Rial. Invoice-line currency is inherited from its invoice header.
2. **Dates:** canonical storage is Gregorian `date`; Jalali is display/input formatting only. Missing dates remain null and are routed for review.
3. **Fiscal isolation:** financial records carry explicit company and fiscal-year scope. Cross-year comparison is read-only analytics.
4. **Double entry:** journal posting requires at least two lines and per-currency debit/credit equality. Posted entries are immutable; correction uses a controlled reversal.
5. **FY closing:** closing requires an approved close action. FY1404 remains open until the owner authorizes close.
6. **Audit:** business and agent audit logs are append-only.
7. **Approvals:** approvals are forward-only; no agent endpoint can approve or post its own proposal.
8. **Idempotency:** imports, source files, journal entries and agent task completions have explicit idempotency anchors.

## RLS and privilege notes

- Business tables have RLS enabled; authenticated access is company-membership and role scoped.
- `anon` has no business-table access.
- The agent task idempotency receipt table is service-role-only.
- The agent audit log is append-only. Owners/accountants may read their company's audit records; service-role code appends records.
- The public membership helpers are invoker wrappers over private SECURITY DEFINER functions.
- `fz_assert_fy_scope` and `fz_assert_date_in_fy` are callable by authenticated users only because row triggers invoke them during scoped writes. Posting, reversal and import-posting RPCs remain service-role-only.
- The PIP API uses a separate Bearer key and server-side Supabase service role. The key is not provisioned in this repository.

## Live verification state

- The connected Supabase project was inspected after migrations 0013–0015.
- Live schema includes the operational module tables, agent task queue, agent policy, append-only agent audit and private `import-source` bucket.
- The live database currently contains two seeded, non-financial PIP tasks and demo-only master data. It contains no posted financial journal entries.
- Migration 0016 has been prepared in source control but is not yet applied to the live project.
- Remaining live checks: authenticated trigger writes after the helper-grant repair; RLS allow/deny tests with real owner/viewer accounts; end-to-end Agent API calls after secure key provisioning; reaper scheduling.

## Recovery and change policy

Migrations are forward-only. Never rewrite a migration already applied to a live database. Before production operations, configure backups/restore, separate preview credentials, and approved hosting/data-residency settings. Do not add real company source records to preview or external AI services without explicit approval.

## Data-impact notes

- Migrations 0013–0016 add schema, constraints, indexes, storage configuration, agent queue metadata and helper permissions.
- Migration 0014 seeds two operational tasks and a default proposal policy. These are workflow metadata, not financial facts.
- No migration inserts journal entries, opening balances, bank transactions, payroll runs, invoices or historical 1404 balances.
- Existing demo records remain visibly marked as demo and are not evidence of real balances.
