# Farzam ERP API — v1

This document covers the existing Muse ingestion boundary and the PIP Agent task API. All privileged database access remains server-side. Agents do not connect directly to PostgreSQL or Supabase.

## 1. Existing Muse ingestion boundary

The legacy API uses the server-only `MUSE_API_KEY` header (`x-muse-api-key`). It remains separate from the PIP Agent API.

- `GET /api/v1/health` — public liveness/version probe; reveals no data or configuration.
- `POST /api/v1/import/batches` — legacy source/batch registration contract. It is not the Milestone B document upload contract and must not be used as proof that raw bytes were archived.

`MUSE_API_KEY` remains empty until the owner provisions it in the deployment environment.

## 2. PIP Agent API

Base path: `/api/agent/v1`

Authentication:

- Header: `Authorization: Bearer <AGENT_API_KEY>`
- Scopes: `tasks:read`, `tasks:write`, `audit:read`
- The development key is intentionally not created or stored in source control or chat.
- Set `AGENT_API_KEY`, `AGENT_API_KEY_ID`, `AGENT_ID`, optional `AGENT_COMPANY_ID`, and `AGENT_API_SCOPES` in the deployment's secure environment settings.
- When the key or database configuration is absent, endpoints return `503 NOT_CONFIGURED`; they never fall back to anonymous access.
- If exactly one active company exists, the API resolves that company. Multi-company environments must set `AGENT_COMPANY_ID`.

### Task queue endpoints

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/health` | `tasks:read` | Real database check and open queue depth |
| GET | `/tasks?status=open&type=report&limit=50&cursor=0` | `tasks:read` | List tasks in oldest-first order |
| POST | `/tasks/{id}/claim` | `tasks:write` | Atomically claim an open task |
| POST | `/tasks/{id}/heartbeat` | `tasks:write` | Renew the owned lease |
| POST | `/tasks/{id}/release` | `tasks:write` | Release an owned task without consuming a failure attempt |
| POST | `/tasks/{id}/complete` | `tasks:write` | Store the result and complete the task |
| POST | `/tasks/{id}/fail` | `tasks:write` | Retry with back-off or mark terminal failure |
| POST | `/tasks/{id}/needs-human` | `tasks:write` | Release the lease and request a human decision |
| GET | `/audit?limit=100` | `audit:read` | Read the append-only audit trail |

### Task state machine

`open → in_progress → done` is the normal path.

An agent claim increments `attempt_count` and acquires a lease. Default lease: 1,800 seconds; allowed range: 60–3,600 seconds. Heartbeat renews the lease only while the caller owns an unexpired lease.

- Retryable failure with attempts remaining returns the task to `open` and sets `next_attempt_at`.
- Back-off is `2^attempt_count` minutes, capped at 60 minutes.
- Permanent failure or exhausted attempts moves the task to terminal `failed` and signals escalation.
- Lease expiry is not a failure. The reaper returns the task to `open` without incrementing attempts or overwriting the last error.
- `needs-human` moves the task to `waiting_for_human` and releases the lease. Human reply/reopen is a web-side action; no agent endpoint can approve its own request.

### Idempotency and audit

- `Idempotency-Key` is required for `complete` and `fail`; it is recommended for `needs-human`.
- A repeated completion/failure with the same task and key returns the original receipt.
- Task ownership is the pair `(claimed_by, unexpired lease)`; otherwise mutating calls return 409.
- Every API call is recorded with request id, actor/key id, route, action, status, task reference, and safe metadata. The audit log is append-only.
- Audit-write failure returns 503 after the operation. A client must retry with the same idempotency key for complete/fail.

### Internal lease reaper

`GET /api/internal/agent/reap` requires `Authorization: Bearer <CRON_SECRET>`. It is not public and must only be called by a configured scheduler. `CRON_SECRET` is not created in source control or chat. The route is implemented; the scheduler is intentionally not activated until its environment secret and schedule are configured.

## 3. Explicitly outside the Agent API

The current Agent API has no endpoint to:

- post or reverse a journal entry;
- approve an accounting entry;
- issue or execute a payment;
- approve or run payroll;
- file a tax return;
- close or lock a fiscal year;
- change the chart of accounts or agent policy.

Those are Class-C operations. They remain authenticated web-UI actions with server-side role checks and database controls. Milestone B will add document registration, extraction submission, journal-entry proposals, and read-only ledger endpoints; it will not add an agent posting endpoint.

## 4. Data and deployment safety

- Never expose the Supabase service-role key to the browser or to Muse.
- Use separate preview and production Supabase credentials.
- Do not use real company records in external AI services or preview deployments without explicit data-residency approval.
- Financial amounts in API contracts must use exact integer strings or exact integer database values with explicit currency. Never use JSON floating-point amounts.
