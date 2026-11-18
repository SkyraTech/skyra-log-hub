-- FEATURE-004-002: separate management and ingestion runtime authority.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['skyra_org_runtime','skyra_ingestion_runtime'] LOOP
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls)
      OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_name::regrole)
      OR EXISTS(SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=role_name::regrole)
      OR EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND datdba=role_name::regrole)
      OR EXISTS(SELECT FROM pg_namespace WHERE nspname='public' AND nspowner=role_name::regrole)
      OR has_schema_privilege(role_name,'public','CREATE') THEN
      RAISE EXCEPTION 'Unapproved credential runtime authority';
    END IF;
  END LOOP;
END $$;
GRANT SELECT(id,tenant_id,project_id,created_by,key_prefix,description,allowed_projects,allowed_environments,
  rate_limit_per_minute,created_at,expires_at,is_revoked,revoked_at,rotated_from_id,issuance_request_id,updated_at,last_used_at)
  ON public.ingestion_credentials TO skyra_org_runtime;
GRANT INSERT(id,tenant_id,project_id,created_by,key_hash,key_prefix,description,allowed_projects,allowed_environments,
  rate_limit_per_minute,created_at,expires_at,rotated_from_id,issuance_request_id)
  ON public.ingestion_credentials TO skyra_org_runtime;
GRANT UPDATE(is_revoked,revoked_at,updated_at) ON public.ingestion_credentials TO skyra_org_runtime;
GRANT USAGE ON SCHEMA public TO skyra_ingestion_runtime;
GRANT SELECT ON public.tenants,public.projects,public.project_quotas TO skyra_ingestion_runtime;
GRANT SELECT(id,tenant_id,key_hash,key_prefix,description,allowed_projects,allowed_environments,
  rate_limit_per_minute,created_at,expires_at,is_revoked,last_used_at)
  ON public.ingestion_credentials TO skyra_ingestion_runtime;
GRANT UPDATE(last_used_at) ON public.ingestion_credentials TO skyra_ingestion_runtime;
GRANT SELECT,INSERT ON public.deduplication_receipts TO skyra_ingestion_runtime;
GRANT SELECT,INSERT,UPDATE ON public.archive_segments,public.ingestion_checkpoints TO skyra_ingestion_runtime;
COMMIT;
