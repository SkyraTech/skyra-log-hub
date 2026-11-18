-- FEATURE-002-002: reviewed application operations only; no role/credential creation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='skyra_org_runtime' AND NOT rolsuper
    AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolinherit)
    OR EXISTS (SELECT FROM pg_auth_members WHERE member='skyra_org_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner='skyra_org_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_database WHERE datname=current_database() AND datdba='skyra_org_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_namespace WHERE nspname='public' AND nspowner='skyra_org_runtime'::regrole)
    OR has_schema_privilege('skyra_org_runtime','public','CREATE') THEN
    RAISE EXCEPTION 'Unapproved runtime ownership or privilege';
  END IF;
END $$;
GRANT UPDATE(status,updated_at) ON public.tenant_memberships,public.project_memberships TO skyra_org_runtime;
GRANT INSERT,DELETE ON public.role_assignments TO skyra_org_runtime;
-- Existing FEATURE-001B SELECT, limited tenant UPDATE and audit INSERT grants remain.
-- Audit UPDATE/DELETE/TRUNCATE and schema mutation remain prohibited.
COMMIT;
