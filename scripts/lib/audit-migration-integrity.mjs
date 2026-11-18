import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {root} from '../isolated-postgres.mjs';
export async function verifyAuditMigration(c){
 const sql=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-009-001/migration.sql')),hash=crypto.createHash('sha256').update(sql).digest('hex');
 const ledger=(await c.query("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261109000000_feature009_audit_read'")).rows;
 if(ledger.length!==1||ledger[0].checksum!==hash||!ledger[0].finished_at||ledger[0].rolled_back_at)throw Error('Audit read migration ledger drift');
 const definitions={admin_audit_tenant_time_id_idx:'tenant_id, created_at DESC, id DESC',admin_audit_tenant_action_time_id_idx:'tenant_id, action, created_at DESC, id DESC',admin_audit_tenant_actor_time_id_idx:'tenant_id, actor_user_id, created_at DESC, id DESC',admin_audit_tenant_resource_time_id_idx:'tenant_id, target_type, target_id, created_at DESC, id DESC'};
 for(const [name,columns]of Object.entries(definitions)){
  const row=(await c.query('SELECT indisvalid,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass($1)',[name])).rows[0];if(!row?.indisvalid||row.definition!==`CREATE INDEX ${name} ON public.admin_audit_events USING btree (${columns})`)throw Error('Audit read index drift');
 }
 const triggers=(await c.query("SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='admin_audit_events'::regclass AND NOT tgisinternal ORDER BY tgname")).rows;
 if(triggers.length!==2||triggers[0].tgname!=='admin_audit_reject_truncate'||triggers[1].tgname!=='admin_audit_reject_update_delete'||triggers.some(t=>t.tgenabled!=='O'||!t.definition.includes('reject_admin_audit_mutation()')))throw Error('Audit append-only trigger drift');
 const actual=(await c.query("SELECT prosrc,proconfig,prosecdef FROM pg_proc WHERE oid=to_regprocedure('reject_admin_audit_mutation()')")).rows[0],expected=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-001A-001/migration.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
 if(actual?.prosrc.replaceAll('\r\n','\n')!==expected?.replaceAll('\r\n','\n')||actual.prosecdef||!actual.proconfig?.includes('search_path=pg_catalog'))throw Error('Audit immutable function drift');
}
