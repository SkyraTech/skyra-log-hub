-- Read indexes on the canonical immutable audit table. No rows or triggers change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX admin_audit_tenant_time_id_idx ON public.admin_audit_events(tenant_id,created_at DESC,id DESC);
CREATE INDEX admin_audit_tenant_action_time_id_idx ON public.admin_audit_events(tenant_id,action,created_at DESC,id DESC);
CREATE INDEX admin_audit_tenant_actor_time_id_idx ON public.admin_audit_events(tenant_id,actor_user_id,created_at DESC,id DESC);
CREATE INDEX admin_audit_tenant_resource_time_id_idx ON public.admin_audit_events(tenant_id,target_type,target_id,created_at DESC,id DESC);
COMMIT;
