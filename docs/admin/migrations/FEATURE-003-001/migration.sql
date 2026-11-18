-- FEATURE-003-001: preserve canonical project identity and quota tenant scope.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX projects_tenant_created_id_idx ON public.projects(tenant_id,created_at,id);
ALTER TABLE public.project_quotas ADD CONSTRAINT project_quotas_tenant_project_fkey
  FOREIGN KEY(tenant_id,project_id) REFERENCES public.projects(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE FUNCTION public.preserve_project_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Project identity and organization are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER projects_immutable_identity BEFORE UPDATE OF id,tenant_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.preserve_project_identity();
COMMIT;
