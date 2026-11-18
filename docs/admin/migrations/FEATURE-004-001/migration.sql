-- FEATURE-004-001: project-consistent credential lifecycle; no plaintext column.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.ingestion_credentials
  ADD COLUMN project_id varchar(64),
  ADD COLUMN created_by uuid,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN rotated_from_id uuid,
  ADD COLUMN issuance_request_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- Only unambiguous, functional legacy single-project rows are adopted.
UPDATE public.ingestion_credentials c SET project_id=c.allowed_projects[1]
WHERE cardinality(c.allowed_projects)=1 AND c.key_hash ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM public.projects p WHERE p.id=c.allowed_projects[1] AND p.tenant_id=c.tenant_id);
ALTER TABLE public.ingestion_credentials
  ADD CONSTRAINT ingestion_credentials_project_fkey FOREIGN KEY(tenant_id,project_id)
    REFERENCES public.projects(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ingestion_credentials_creator_fkey FOREIGN KEY(created_by)
    REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  ADD CONSTRAINT ingestion_credentials_tenant_project_id_key UNIQUE(tenant_id,project_id,id),
  ADD CONSTRAINT ingestion_credentials_replacement_key UNIQUE(rotated_from_id),
  ADD CONSTRAINT ingestion_credentials_request_key UNIQUE(issuance_request_id),
  ADD CONSTRAINT ingestion_credentials_replacement_fkey FOREIGN KEY(tenant_id,project_id,rotated_from_id)
    REFERENCES public.ingestion_credentials(tenant_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ingestion_credentials_project_scope CHECK(project_id IS NULL OR
    (allowed_projects=ARRAY[project_id]::text[] AND key_hash ~ '^[a-f0-9]{64}$')),
  ADD CONSTRAINT ingestion_credentials_revoked_time CHECK(revoked_at IS NULL OR is_revoked);
CREATE INDEX ingestion_credentials_project_created_id_idx ON public.ingestion_credentials(tenant_id,project_id,created_at,id);
CREATE FUNCTION public.protect_managed_credential() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.project_id IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['last_used_at','is_revoked','revoked_at','updated_at','created_by'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['last_used_at','is_revoked','revoked_at','updated_at','created_by'])
      OR (OLD.is_revoked AND NOT NEW.is_revoked)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
      OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL) THEN
      RAISE EXCEPTION 'Managed credential identity, scope and revocation are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ingestion_credentials_managed_integrity BEFORE UPDATE ON public.ingestion_credentials
FOR EACH ROW EXECUTE FUNCTION public.protect_managed_credential();
COMMIT;
