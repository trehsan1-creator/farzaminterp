# Deploying Farzam ERP to Vercel

Stage 00 ships a `vercel.json` so the scaffold can be deployed as-is.
This document records the deploy steps and the release gates that still
apply (AGENTS.md §6, §10).

## Configuration

| File | Purpose |
|---|---|
| `vercel.json` | Framework `nextjs`, function region `fra1` (Frankfurt/EU), explicit install/build commands |
| `.npmrc` | `legacy-peer-deps=true` so local and Vercel installs resolve identically |
| `package.json` `engines` | Node `>=22.12.0` (Vercel picks Node 22 automatically) |

**Region note (release gate):** `regions: ["fra1"]` is a placeholder
default pending the owner's data-residency approval. Change it (and the
matching Supabase project region) together, before any real financial
data is loaded. Latency must never override data residency.

## Steps

1. In Vercel: *Add New Project* → import `trehsan1-creator/farzaminterp`
   (or run `vercel` from a local checkout). Framework and build settings
   are auto-read from `vercel.json`.
2. Set environment variables (values from your private channel — never
   commit them; see `.env.example`):

   | Variable | Where | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | build + runtime | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + runtime | public, RLS-scoped |
   | `SUPABASE_SERVICE_ROLE_KEY` | **server only** | never exposed to the browser bundle |
   | `SUPABASE_STORAGE_BUCKET` | server | default `import-source` |
   | `MUSE_API_KEY` | server | leave empty in Stage 00 (API answers NOT_CONFIGURED) |
   | `NEXT_PUBLIC_APP_ENV` | build | `preview` / `production` |

3. Apply database migrations as a **separately controlled step**
   (`supabase db push`) against the environment's own Supabase project
   — never run migrations from a preview deployment against production.
4. Deploy. Without Supabase configured the app still builds and runs:
   every screen shows the honest "database not configured" state and the
   Muse API answers `503 NOT_CONFIGURED`.

## Preview vs production

- Preview and production must use **separate Supabase projects** and
  credentials; never point preview at the production database.
- Production deployments only from the approved branch (`main`), after
  the owner approves the hosting region.
- Do not load real FY1404 data into any deployment until the data-
  residency release gate is cleared (README).
