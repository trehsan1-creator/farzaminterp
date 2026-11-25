-- ============================================================================
-- 0012 — Explicit server-side service_role table privileges
-- Farzam ERP / Stage 00
--
-- Migration 0010 enabled RLS and documented service_role as the controlled
-- server-side data-access role, but the actual PostgreSQL default ACL for
-- postgres-owned public tables did not include SELECT / INSERT / UPDATE.
-- This migration grants only the DML required by the server-side app.
--
-- The service-role key must remain server-only. No browser/client code may
-- receive it. RLS policies remain unchanged; service_role bypasses RLS by
-- design for the controlled server-side repositories and import pipeline.
-- Financial DELETE privileges are intentionally not granted.
-- ============================================================================

grant select, insert, update
  on all tables in schema public
  to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update on tables to service_role;

-- UUID primary keys are used today, but grant sequence access for any future
-- server-side identity/serial columns created by the postgres migration role.
grant usage, select
  on all sequences in schema public
  to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
