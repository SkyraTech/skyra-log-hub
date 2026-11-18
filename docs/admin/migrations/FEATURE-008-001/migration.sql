-- Daily project admission budgets. Accounting is independent of receipt TTL and archives.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE project_quotas
  ADD COLUMN daily_events bigint,
  ADD COLUMN daily_bytes bigint,
  ADD COLUMN enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT project_quota_bounds CHECK
    ((daily_events IS NULL OR daily_events BETWEEN 0 AND 9007199254740991)
    AND (daily_bytes IS NULL OR daily_bytes BETWEEN 0 AND 9007199254740991)
    AND version > 0);
CREATE TABLE quota_journals (
  id uuid PRIMARY KEY,
  path_hash varchar(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_usage_windows (
  tenant_id uuid NOT NULL,
  project_id varchar(64) NOT NULL,
  period date NOT NULL,
  accepted_events bigint NOT NULL DEFAULT 0,
  accepted_bytes bigint NOT NULL DEFAULT 0,
  reserved_events bigint NOT NULL DEFAULT 0,
  reserved_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,project_id,period),
  CONSTRAINT usage_project_fkey FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT usage_bounds CHECK (accepted_events>=0 AND accepted_bytes>=0 AND reserved_events>=0 AND reserved_bytes>=0
    AND accepted_events<=9007199254740991-reserved_events AND accepted_bytes<=9007199254740991-reserved_bytes)
);
CREATE TABLE quota_admissions (
  tenant_id uuid NOT NULL,
  project_id varchar(64) NOT NULL,
  batch_id varchar(64) NOT NULL,
  digest varchar(71) NOT NULL,
  events integer NOT NULL CHECK(events>0),
  bytes bigint NOT NULL CHECK(bytes>0 AND bytes<=9007199254740991),
  period date NOT NULL,
  journal_id uuid NOT NULL REFERENCES quota_journals(id) ON DELETE RESTRICT,
  state varchar(16) NOT NULL CHECK(state IN ('RESERVED','COMMITTED','CANCELLED')),
  receipt_id uuid NOT NULL,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,project_id,batch_id),
  CONSTRAINT admission_window_fkey FOREIGN KEY(tenant_id,project_id,period) REFERENCES project_usage_windows(tenant_id,project_id,period) ON DELETE RESTRICT,
  CONSTRAINT admission_receipt_check CHECK ((state='COMMITTED')=(receipt IS NOT NULL))
);
CREATE INDEX quota_admissions_pending_idx ON quota_admissions(journal_id,state) WHERE state='RESERVED';
COMMIT;
