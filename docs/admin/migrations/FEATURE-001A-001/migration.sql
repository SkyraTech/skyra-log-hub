-- FEATURE-001A-001: audit retention and append-only protection.
-- Isolated rehearsal only. Protected execution requires separate explicit approval.
-- Keep ADMIN-002 byte-for-byte unchanged. Existing rows are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT fk_admin_audit_events_tenant,
  ADD CONSTRAINT fk_admin_audit_events_tenant
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Actor deletion must not silently rewrite the immutable actor reference.
-- Deactivate identities instead; a future approved retention workflow must handle erasure.
ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT fk_admin_audit_events_actor,
  ADD CONSTRAINT fk_admin_audit_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES public.users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public.reject_admin_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit history is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER admin_audit_reject_update_delete
  BEFORE UPDATE OR DELETE ON public.admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_admin_audit_mutation();
CREATE TRIGGER admin_audit_reject_truncate
  BEFORE TRUNCATE ON public.admin_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_admin_audit_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_events FROM PUBLIC;
COMMIT;
