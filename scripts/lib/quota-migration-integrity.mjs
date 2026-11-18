import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
import {root} from '../isolated-postgres.mjs';
export async function verifyQuotaMigration(client){
  for(const [name,file]of [['20261106000000_feature008_quotas','FEATURE-008-001'],['20261106010000_feature008_lock_authority','FEATURE-008-003']]){
    const bytes=fs.readFileSync(path.join(root,'docs/admin/migrations',file,'migration.sql')),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const rows=(await client.query('SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1',[name])).rows;
    if(rows.length!==1||rows[0].checksum!==hash||!rows[0].finished_at||rows[0].rolled_back_at)throw Error('Quota migration ledger drift');
  }
  const constraints=(await client.query("SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('project_quotas'::regclass,'project_usage_windows'::regclass,'quota_admissions'::regclass)")).rows;
  for(const name of ['project_quota_bounds','usage_bounds','usage_project_fkey','admission_window_fkey','admission_receipt_check','project_usage_windows_pkey','quota_admissions_pkey'])if(!constraints.some(r=>r.conname===name&&r.convalidated))throw Error('Quota constraint drift');
  if(!constraints.find(r=>r.conname==='usage_bounds').definition.includes('9007199254740991'))throw Error('Quota counter bounds drift');
  const f=(await client.query("SELECT prosrc,prosecdef,proconfig,proowner::regrole::text AS owner FROM pg_proc WHERE oid=to_regprocedure('public.lock_active_quota_project(uuid,text)')")).rows[0];
  const source=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-008-003/migration.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
  if(!f||!f.prosecdef||!f.proconfig?.includes('search_path=pg_catalog')||f.owner!=='skyra_isolated_user'||f.prosrc.replaceAll('\r\n','\n')!==source?.replaceAll('\r\n','\n'))throw Error('Quota lock function drift');
  const index=(await client.query("SELECT indisvalid,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass('quota_admissions_pending_idx')")).rows[0];if(!index?.indisvalid||!index.definition.includes('journal_id, state'))throw Error('Quota recovery index drift');
}
