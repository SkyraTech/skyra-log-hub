-- FEATURE-002-001: existing-member integrity and stable list ordering.
-- Candidate only; protected execution requires separate approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_membership_fkey
  FOREIGN KEY (tenant_id,user_id) REFERENCES public.tenant_memberships(tenant_id,user_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX tenant_memberships_tenant_created_id_idx ON public.tenant_memberships(tenant_id,created_at,id);
CREATE FUNCTION public.enforce_admin_role_scope() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.roles WHERE id=NEW.role_id AND name IN ('OrgOwner','OrgAdmin')) THEN
    RAISE EXCEPTION 'Organization administrative roles require organization scope' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER role_assignments_admin_scope BEFORE INSERT OR UPDATE OF role_id,project_id ON public.role_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_role_scope();
COMMIT;
