-- FEATURE-001B-002: organization runtime grants, not credential activation.
-- Role provisioning is a separately reviewed prerequisite. Never executed on port 5432 here.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='skyra_org_runtime'
    AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole) THEN
    RAISE EXCEPTION 'Expected an explicitly provisioned unprivileged runtime role';
  END IF;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
    WHERE r.rolname='skyra_org_runtime' AND c.relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'Runtime must not own application tables';
  END IF;
  IF EXISTS (SELECT FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
    WHERE d.datname=current_database() AND r.rolname='skyra_org_runtime')
    OR EXISTS (SELECT FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
      WHERE n.nspname='public' AND r.rolname='skyra_org_runtime')
    OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
      WHERE r.rolname='skyra_org_runtime') THEN
    RAISE EXCEPTION 'Runtime must not own the database/schema or inherit other roles';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO skyra_org_runtime;
GRANT SELECT ON users, tenant_memberships, project_memberships, role_assignments,
  roles, tenants, projects, admin_audit_events TO skyra_org_runtime;
GRANT UPDATE(name, updated_at) ON tenants TO skyra_org_runtime;
-- SELECT FOR SHARE requires UPDATE on at least one column; only timestamps are granted.
GRANT UPDATE(updated_at) ON users, tenant_memberships TO skyra_org_runtime;
GRANT INSERT ON admin_audit_events TO skyra_org_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_events FROM skyra_org_runtime;
COMMIT;
