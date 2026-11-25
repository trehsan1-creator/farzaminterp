# Farzam ERP — Muse/PIP API Contract v1

Versioned JSON boundary for external agents (Muse/PIP, Farzam Bot v2).
**Agents never touch the database directly** (AGENTS.md §7). All routes
live under `src/app/api/v1/`, validate input with the zod schemas in
`src/api/v1/contracts.ts`, and answer through a stable error envelope.

## Authentication

- Header: `x-muse-api-key`.
- The key is compared (timing-safe) against the server-side
  `MUSE_API_KEY` environment variable.
- **Stage 00 provisions no credential.** With `MUSE_API_KEY` unset every
  endpoint answers:

  ```json
  { "error": { "code": "NOT_CONFIGURED", "message": "..." } }   // 503
  ```

- Invalid/missing key against a configured server → `401 UNAUTHORIZED`.
- Privileged Supabase keys are never exposed to clients; routes use the
  server-side service client only.

## Conventions

| Concern | Rule |
|---|---|
| Money | exact integer **strings** (`"4200000000"`); JSON numbers, decimals and exponent forms are rejected by schema |
| Currency | explicit `IRR` / `IRT` only — never inferred |
| Dates | canonical ISO `YYYY-MM-DD` (Jalali is display-only) |
| Fiscal scope | every financial read requires an explicit `fiscal_year_id`; no defaulting from the current date |
| Errors | `{ "error": { "code", "message", "details?" } }` |
| Versioning | additive changes stay in v1; breaking changes create `/api/v2` |

## Endpoints

### `GET /api/v1/health`
Unauthenticated liveness/version probe.
→ `200 { "status": "ok", "api": "v1", "service": "farzam-erp" }`

### `GET /api/v1/fiscal-years?company_id=<uuid>`
Fiscal-year workspaces of a company.
→ `200 { "fiscal_years": [{ "id", "label", "start_date", "end_date", "status", "is_reconstruction" }] }`

### `GET /api/v1/documents?fiscal_year_id=<uuid>&limit=&offset=`
Read-only document registry for one fiscal year.
→ `200 { "documents": [...], "limit", "offset" }`
Missing/invalid `fiscal_year_id` → `400 FISCAL_YEAR_REQUIRED`.

### `GET /api/v1/import-batches?fiscal_year_id=<uuid>`
Import batch monitor (status/stage/stats).
→ `200 { "import_batches": [...] }`

### `POST /api/v1/import/batches`
Idempotent source-file + batch registration (boundary stub for Stage 00):

```jsonc
{
  "fiscal_year_id": "uuid",
  "original_filename": "fy1404-ledger.csv",
  "content_sha256": "<64 hex>",
  "byte_size": 12345,
  "content_base64": "...",
  "pipeline_version": "fy1404-import@1",   // optional
  "expected_totals": {                      // optional, explicit only
    "rows": 120,
    "total_amount": "4200000000",
    "currency": "IRR"
  },
  "declared_currency": "IRR"                // optional operator declaration
}
```

- The server re-hashes the bytes; a mismatch → `400 VALIDATION_FAILED`
  **before any write**.
- First call → `201 { batch_id, status, stage, created: true, idempotency_key }`.
- Retry with identical bytes → `200 { ..., created: false }` (same batch).
- Normalization/validation/posting are NOT performed by this endpoint;
  they run through the pipeline service (see `docs/IMPORT_PIPELINE.md`).

## Write-authority rules (Muse)

- Muse may register source files, read permitted records, and propose
  data through these contracts.
- Posting financial records requires an `approvals` decision by an
  authorized human — the API cannot bypass `post_import_batch`.
- Every agent write must carry an idempotency anchor (content hash /
  idempotency key) and is attributed in `audit_events`.
- AI-suggested values are never presented as posted facts.

## Roadmap (later stages)

- `POST /api/v1/import/batches/{id}/run` — run pipeline stages remotely.
- `POST /api/v1/approvals` — request/decide approvals with scopes.
- Read endpoints for journal entries, invoices, treasury and reports.
- Scoped tokens per agent/task with rate limits and audit correlation.
