-- FEATURE-001B-001: prevent tenant/project mismatch; no protected execution authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE UNIQUE INDEX projects_tenant_id_id_key ON public.projects(tenant_id, id);
ALTER TABLE public.project_memberships ADD CONSTRAINT project_memberships_tenant_project_fkey
  FOREIGN KEY (tenant_id, project_id) REFERENCES public.projects(tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_tenant_project_fkey
  FOREIGN KEY (tenant_id, project_id) REFERENCES public.projects(tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_display_name_length
  CHECK (char_length(btrim(name)) BETWEEN 2 AND 255);
COMMIT;
