import assert from 'node:assert/strict';

// PostgreSQL 17 catalog definitions; fail closed on structural drift as well as ledger drift.
export async function verifySavedSearchIntegrity(client) {
 const constraints=(await client.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='saved_searches'::regclass ORDER BY conname")).rows;
 const expected={
 saved_searches_filters_check:"CHECK (((jsonb_typeof(filters) = 'object'::text) AND (octet_length((filters)::text) <= 8192) AND ((filters ->> 'v'::text) = '1'::text)))",
 saved_searches_name_check:"CHECK (((length(btrim((name)::text)) >= 1) AND (length(btrim((name)::text)) <= 120)))",
 saved_searches_owner_id_fkey:'FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT',
 saved_searches_owner_name_key:'UNIQUE (tenant_id, project_id, owner_id, name)',
 saved_searches_pkey:'PRIMARY KEY (id)',
 saved_searches_project_scope_fk:'FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON DELETE RESTRICT',
 saved_searches_tenant_id_fkey:'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
 saved_searches_version_check:"CHECK (((version >= 1) AND (version <= '9007199254740991'::bigint)))",
 saved_searches_visibility_check:"CHECK (((visibility)::text = ANY ((ARRAY['PRIVATE'::character varying, 'PROJECT'::character varying])::text[])))"
 };
 assert.deepEqual(Object.fromEntries(constraints.map(r=>[r.conname,r.definition])),expected,'Saved-search constraint drift');
 const columns=(await client.query("SELECT column_name,is_nullable,data_type,character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' ORDER BY ordinal_position")).rows;
 assert.deepEqual(columns.map(r=>[r.column_name,r.is_nullable]),['id','tenant_id','project_id','owner_id','name','description','visibility','filters','version','created_at','updated_at'].map(n=>[n,'NO']),'Saved-search column drift');
 const types=columns.map(r=>[r.data_type,r.character_maximum_length]);
 assert.deepEqual(types,[['uuid',null],['uuid',null],['character varying',64],['uuid',null],['character varying',120],['character varying',500],['character varying',7],['jsonb',null],['bigint',null],['timestamp with time zone',null],['timestamp with time zone',null]],'Saved-search column type drift');
 assert.equal(Number((await client.query("SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='saved_searches' AND grantee='PUBLIC'")).rows[0].count),0,'Saved-search public grant drift');
 const indexes=(await client.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='saved_searches' ORDER BY indexname")).rows;
 assert.equal(indexes.length,4);assert.ok(indexes.some(r=>r.indexname==='saved_searches_owner_list_idx'&&r.indexdef.endsWith('(tenant_id, project_id, owner_id, id)')));assert.ok(indexes.some(r=>r.indexname==='saved_searches_shared_list_idx'&&r.indexdef.includes('(tenant_id, project_id, id) WHERE')&&r.indexdef.includes("'PROJECT'")));
 for(const role of ['skyra_org_runtime','skyra_ingestion_runtime','skyra_bff_sessions_runtime']){
  const actual=(await client.query("SELECT has_table_privilege($1,'saved_searches','SELECT') AS read,has_table_privilege($1,'saved_searches','INSERT') AS insert,has_table_privilege($1,'saved_searches','UPDATE') AS update,has_table_privilege($1,'saved_searches','DELETE') AS delete,has_table_privilege($1,'saved_searches','TRUNCATE') AS truncate",[role])).rows[0];
  assert.deepEqual(actual,{read:role==='skyra_org_runtime',insert:role==='skyra_org_runtime',update:role==='skyra_org_runtime',delete:role==='skyra_org_runtime',truncate:false},'Saved-search runtime grant drift');
 }
 return {constraints:constraints.length,indexes:indexes.length,columns:columns.length,restrictedGrants:true};
}
