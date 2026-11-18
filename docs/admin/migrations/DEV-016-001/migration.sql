BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE dashboard_preferences (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 project_id varchar(64) NOT NULL,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object' AND octet_length(settings::text)<=2048 AND COALESCE(settings->>'v'='1',false)),
 version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,project_id,owner_id),
 CONSTRAINT dashboard_preferences_project_scope_fk FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON dashboard_preferences FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON dashboard_preferences TO skyra_org_runtime;
COMMIT;
