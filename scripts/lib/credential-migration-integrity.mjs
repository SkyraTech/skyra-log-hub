import crypto from 'node:crypto';
export async function verifyCredentialMigration(client,artifact){
  const checksum=crypto.createHash('sha256').update(artifact).digest('hex');const rows=(await client.query("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261105000000_feature004_credentials'")).rows;
  if(rows.length!==1||rows[0].checksum!==checksum||!rows[0].finished_at||rows[0].rolled_back_at)throw Error('Credential migration checksum/ledger mismatch');
  const index=(await client.query("SELECT indisvalid,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass('public.ingestion_credentials_project_created_id_idx')")).rows[0];
  const constraints=(await client.query("SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.ingestion_credentials'::regclass")).rows;
  const names=['ingestion_credentials_project_fkey','ingestion_credentials_creator_fkey','ingestion_credentials_tenant_project_id_key','ingestion_credentials_replacement_key','ingestion_credentials_request_key','ingestion_credentials_replacement_fkey','ingestion_credentials_project_scope','ingestion_credentials_revoked_time'];
  const definitions={
    ingestion_credentials_project_fkey:'FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ingestion_credentials_creator_fkey:'FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE SET NULL',
    ingestion_credentials_tenant_project_id_key:'UNIQUE (tenant_id, project_id, id)',
    ingestion_credentials_replacement_key:'UNIQUE (rotated_from_id)',
    ingestion_credentials_request_key:'UNIQUE (issuance_request_id)',
    ingestion_credentials_replacement_fkey:'FOREIGN KEY (tenant_id, project_id, rotated_from_id) REFERENCES ingestion_credentials(tenant_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ingestion_credentials_project_scope:"CHECK (((project_id IS NULL) OR ((allowed_projects = ARRAY[(project_id)::text]) AND ((key_hash)::text ~ '^[a-f0-9]{64}$'::text))))",
    ingestion_credentials_revoked_time:'CHECK (((revoked_at IS NULL) OR is_revoked))'
  };
  const trigger=(await client.query("SELECT t.tgenabled,t.tgtype,p.proconfig,p.prosecdef,p.prosrc FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.ingestion_credentials'::regclass AND t.tgname='ingestion_credentials_managed_integrity' AND p.oid=to_regprocedure('public.protect_managed_credential()')")).rows[0];
  const body=artifact.toString().match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
  if(!index?.indisvalid||!index.definition.includes('(tenant_id, project_id, created_at, id)')||!names.every(n=>constraints.some(c=>c.conname===n&&c.convalidated&&c.definition===definitions[n]))||trigger?.tgenabled!=='O'||trigger.tgtype!==19||trigger.prosecdef||!trigger.proconfig?.includes('search_path=pg_catalog')||!body||trigger.prosrc.replaceAll('\r\n','\n')!==body.replaceAll('\r\n','\n'))throw Error('Credential migration catalog mismatch');
}
