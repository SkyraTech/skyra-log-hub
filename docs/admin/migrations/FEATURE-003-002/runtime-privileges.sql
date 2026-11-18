-- FEATURE-003-002: narrow operational grants; no protected activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='skyra_org_runtime' AND NOT rolsuper
    AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls)
    OR EXISTS(SELECT FROM pg_auth_members WHERE member='skyra_org_runtime'::regrole)
    OR EXISTS(SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner='skyra_org_runtime'::regrole)
    OR EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND datdba='skyra_org_runtime'::regrole)
    OR EXISTS(SELECT FROM pg_namespace WHERE nspname='public' AND nspowner='skyra_org_runtime'::regrole)
    OR has_schema_privilege('skyra_org_runtime','public','CREATE') THEN
    RAISE EXCEPTION 'Unapproved project runtime authority';
  END IF;
END $$;
GRANT INSERT(id,tenant_id,name,status,created_at,updated_at),UPDATE(name,status,updated_at)
  ON public.projects TO skyra_org_runtime;
COMMIT;
