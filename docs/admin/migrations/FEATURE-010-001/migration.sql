-- Project archive retention policy configuration (BL-05)
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS project_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id varchar(64) NOT NULL,
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  enable_parquet_purge boolean NOT NULL DEFAULT true,
  is_legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_retention_tenant_project_key UNIQUE (tenant_id, project_id),
  CONSTRAINT project_retention_tenant_project_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS project_retention_tenant_idx ON project_retention_policies(tenant_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skyra_org_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON project_retention_policies TO skyra_org_runtime;
  END IF;
END $$;
COMMIT;
