-- Narrow lock-only authority. Runtime cannot change project or tenant metadata.
BEGIN;
CREATE FUNCTION public.lock_active_quota_project(tenant uuid,project text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM p.id FROM public.projects p JOIN public.tenants t ON t.id=p.tenant_id
    WHERE p.tenant_id=tenant AND p.id=project AND p.status='ACTIVE' AND t.status='ACTIVE'
    FOR SHARE OF p,t;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.lock_active_quota_project(uuid,text) FROM PUBLIC;
COMMIT;
