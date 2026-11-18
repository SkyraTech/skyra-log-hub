BEGIN;
SET LOCAL lock_timeout='5s';
GRANT SELECT,INSERT,UPDATE ON project_usage_windows,quota_admissions TO skyra_ingestion_runtime;
GRANT SELECT,INSERT ON quota_journals TO skyra_ingestion_runtime;
GRANT SELECT ON project_usage_windows TO skyra_org_runtime;
GRANT SELECT,INSERT,UPDATE ON project_quotas TO skyra_org_runtime;
GRANT EXECUTE ON FUNCTION public.lock_active_quota_project(uuid,text) TO skyra_ingestion_runtime;
COMMIT;
