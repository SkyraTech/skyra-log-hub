BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE saved_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 project_id varchar(64) NOT NULL,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 name varchar(120) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 description varchar(500) NOT NULL DEFAULT '',
 visibility varchar(7) NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','PROJECT')),
 filters jsonb NOT NULL CHECK (jsonb_typeof(filters)='object' AND octet_length(filters::text)<=8192 AND filters->>'v'='1'),
 version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT saved_searches_project_scope_fk FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT saved_searches_owner_name_key UNIQUE(tenant_id,project_id,owner_id,name)
);
CREATE INDEX saved_searches_owner_list_idx ON saved_searches(tenant_id,project_id,owner_id,id);
CREATE INDEX saved_searches_shared_list_idx ON saved_searches(tenant_id,project_id,id) WHERE visibility='PROJECT';
REVOKE ALL ON saved_searches FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON saved_searches TO skyra_org_runtime;
COMMIT;
