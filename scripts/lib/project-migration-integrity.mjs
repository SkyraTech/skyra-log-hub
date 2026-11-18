import crypto from 'node:crypto';
export async function verifyProjectMigration(client,artifact){
  const checksum=crypto.createHash('sha256').update(artifact).digest('hex');
  const ledger=(await client.query("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261104010000_feature003_projects'")).rows;
  if(ledger.length!==1||ledger[0].checksum!==checksum||!ledger[0].finished_at||ledger[0].rolled_back_at)throw Error('Project migration checksum/ledger mismatch');
  const index=(await client.query("SELECT i.indisvalid,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indexrelid=to_regclass('public.projects_tenant_created_id_idx')")).rows[0];
  const fk=(await client.query("SELECT convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.project_quotas'::regclass AND conname='project_quotas_tenant_project_fkey'")).rows[0];
  const trigger=(await client.query("SELECT t.tgenabled,p.proconfig FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.projects'::regclass AND t.tgname='projects_immutable_identity' AND p.oid=to_regprocedure('public.preserve_project_identity()')")).rows[0];
  if(!index?.indisvalid||!index.definition.includes('(tenant_id, created_at, id)')||!fk?.convalidated||!fk.definition.includes('REFERENCES projects(tenant_id, id)')||!fk.definition.includes('ON UPDATE RESTRICT ON DELETE RESTRICT')||trigger?.tgenabled!=='O'||!trigger.proconfig?.includes('search_path=pg_catalog'))throw Error('Project migration catalog mismatch');
}
