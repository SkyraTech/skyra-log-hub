import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {root} from '../isolated-postgres.mjs';
export async function verifySessionMigration(client){
 const checksum=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'docs/admin/migrations/DEV-013-001/migration.sql'))).digest('hex');
 const rows=(await client.query("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261110000000_dev013_sessions'")).rows;
 if(rows.length!==1||rows[0].checksum!==checksum||!rows[0].finished_at||rows[0].rolled_back_at)throw Error('Session migration ledger drift');
 const indexes=(await client.query("SELECT indexrelid::regclass::text AS name,indisvalid,indisunique,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indrelid=ANY(ARRAY['bff_sessions'::regclass,'bff_login_transactions'::regclass])")).rows;
 const required=['bff_sessions_pkey','bff_sessions_token_digest_key','bff_sessions_expiry_idx','bff_sessions_revoked_idx','bff_login_transactions_pkey','bff_login_expiry_idx'];
 if(indexes.length!==required.length||required.some(name=>!indexes.some(i=>i.name===name&&i.indisvalid)))throw Error('Session index drift');
 for(const name of ['bff_sessions_token_digest_key','bff_login_transactions_pkey'])if(!indexes.find(i=>i.name===name)?.indisunique)throw Error('Session verifier uniqueness drift');
 const constraints=(await client.query("SELECT conrelid::regclass::text AS table_name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=ANY(ARRAY['bff_sessions'::regclass,'bff_login_transactions'::regclass]) AND contype='c'")).rows;
 if(constraints.filter(c=>c.table_name==='bff_sessions').length!==5||constraints.filter(c=>c.table_name==='bff_login_transactions').length!==3)throw Error('Session constraint drift');
 const privileges=(await client.query("SELECT has_table_privilege('skyra_ingestion_runtime','bff_sessions','SELECT,INSERT,UPDATE,DELETE') AS gateway_sessions,has_table_privilege('skyra_org_runtime','bff_sessions','SELECT,INSERT,UPDATE,DELETE') AS admin_sessions,has_table_privilege('skyra_ingestion_runtime','bff_login_transactions','SELECT,INSERT,UPDATE,DELETE') AS gateway_login,has_table_privilege('skyra_org_runtime','bff_login_transactions','SELECT,INSERT,UPDATE,DELETE') AS admin_login")).rows[0];
 if(Object.values(privileges).some(Boolean))throw Error('Session service privilege separation drift');
 return {checksum,indexes:required,checks:constraints.length,privileges};
}
