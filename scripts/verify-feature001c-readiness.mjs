import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { root, testEnvironment, readState, isolatedAdminClient } from './isolated-postgres.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';
const evidence=path.join(root,'.tmp/feature001c-evidence');fs.mkdirSync(evidence,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});return {status:r.status,output:r.stdout.trim()};};
const paths=[['20261024000000_init_metadata','apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql'],['20261028000000_admin_iam_foundation','docs/admin/migrations/ADMIN-002/migration.sql'],['20261103000000_feature001a_audit_integrity','docs/admin/migrations/FEATURE-001A-001/migration.sql'],['20261103010000_feature001b_tenant_consistency','docs/admin/migrations/FEATURE-001B-001/migration.sql'],['operational-runtime-grants','docs/admin/migrations/FEATURE-001B-002/runtime-privileges.sql']];
const artifacts=paths.map(([id,file])=>{const bytes=fs.readFileSync(path.join(root,file));return {id,file,bytes:bytes.length,sha256:hash(bytes),lfSha256:hash(bytes.toString().replaceAll('\r\n','\n')),tracked:git('ls-files','--error-unmatch',file).status===0,status:git('status','--short','--',file).output};});
const reports=fs.readdirSync(root).filter(f=>/^SKYRA_LOGHUB_FEATURE_001(A|B)?_.*\.md$/.test(f)).map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const configuration={};
const publicKeys=new Set(['OIDC_ISSUER_URL','OIDC_CLIENT_ID','OIDC_REDIRECT_URI','ENABLE_MOCK_OIDC','BFF_USE_AUTHORITATIVE_MEMBERSHIP','ADMIN_PERSISTENCE_ENABLED','NODE_ENV']);
for(const file of ['apps/console-bff/.env','apps/admin-service/.env','apps/console-web/.env','apps/ingestion-gateway/.env','apps/query-service/.env']) {
  if(!fs.existsSync(path.join(root,file))){configuration[file]={exists:false};continue;}
  const settings={};for(const line of fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)) {const match=/^([A-Z_]+)=(.*)$/.exec(line);if(match)settings[match[1]]=publicKeys.has(match[1])?match[2]:{present:true,value:'REDACTED'};}
  configuration[file]={exists:true,settings};
}
configuration.process=Object.fromEntries([...publicKeys].map(k=>[k,process.env[k]??'UNSET']));
const env=testEnvironment(), client=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);
const schema=async()=>{
  const queries=["SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2","SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2","SELECT c.relname,c.relacl::text FROM pg_class c WHERE c.relnamespace='public'::regnamespace ORDER BY 1"];
  const rows=[];for(const sql of queries)rows.push((await client.query(sql)).rows);
  return hash(JSON.stringify(rows));
};
const checks=[];
try {
  const ledger=(await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;
  for(const artifact of artifacts.slice(0,4))assert.equal(ledger.find(row=>row.migration_name===artifact.id)?.checksum,artifact.sha256);
  assert.equal(ledger.length,4);assert.ok(ledger.every(row=>row.finished_at&&!row.rolled_back_at));checks.push('four successful exact-byte schema ledger entries; no grant pseudo-migration');
  const before=await schema();
  const sql=fs.readFileSync(path.join(root,paths[3][1]),'utf8');
  // Create the pre-B shape inside one disposable transaction, replay its statements,
  // then fail before commit. The rollback must restore the complete current shape.
  await client.query('BEGIN');
  await client.query('ALTER TABLE project_memberships DROP CONSTRAINT project_memberships_tenant_project_fkey; ALTER TABLE role_assignments DROP CONSTRAINT role_assignments_tenant_project_fkey; ALTER TABLE tenants DROP CONSTRAINT tenants_display_name_length; DROP INDEX projects_tenant_id_id_key;');
  await assert.rejects(client.query(sql.replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,'SELECT * FROM feature001c_intentional_missing_relation;')),{code:'42P01'});await client.query('ROLLBACK');assert.equal(await schema(),before);
  checks.push('consistency migration derived failure fixture rolls back all preparation and migration changes');
  await assert.rejects(client.query(sql),{code:'42P07'});await client.query('ROLLBACK');assert.equal(await schema(),before);checks.push('raw consistency replay refuses existing index; full rollback leaves schema and ledger unchanged');
  const admin=await isolatedAdminClient(readState());
  let privileges;
  try {
    const grants=fs.readFileSync(path.join(root,paths[4][1]),'utf8');
    await admin.query(grants);await admin.query(grants);assert.equal(await schema(),before);checks.push('exact operational grants repeat safely without catalog or ledger drift');
    const fixture=grants.replace(/COMMIT;\s*$/,'REVOKE SELECT ON public.tenants FROM skyra_org_runtime; SELECT * FROM feature001c_intentional_missing_relation; COMMIT;');
    await assert.rejects(admin.query(fixture),{code:'42P01'});await admin.query('ROLLBACK');assert.equal(await schema(),before);checks.push('operational grant failure rolls back ACL changes');
    privileges={};for(const [key,query] of Object.entries({
      schemas:"SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text FROM pg_namespace WHERE nspname IN ('public','skyra_test') ORDER BY 1",
      tables:"SELECT relname,relkind,pg_get_userbyid(relowner) AS owner,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY 1",
      columnGrants:"SELECT table_name,column_name,privilege_type FROM information_schema.column_privileges WHERE grantee='skyra_org_runtime' ORDER BY 1,2,3",
      role:"SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls,rolconfig FROM pg_roles WHERE rolname='skyra_org_runtime'",
      membership:"SELECT roleid::regrole::text,member::regrole::text FROM pg_auth_members WHERE member='skyra_org_runtime'::regrole",
      connect:"SELECT has_database_privilege('skyra_org_runtime',current_database(),'CONNECT') AS connect,has_schema_privilege('skyra_org_runtime','public','USAGE') AS usage,has_schema_privilege('skyra_org_runtime','public','CREATE') AS create",
      functions:"SELECT proname,pg_get_userbyid(proowner) AS owner,prosecdef,proconfig,proacl::text FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1",
      triggers:"SELECT tgname,tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY 1",
      defaultPrivileges:"SELECT defaclrole::regrole::text,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2"
    }))privileges[key]=(await admin.query(query)).rows;
    assert.deepEqual(privileges.connect,[{connect:true,usage:true,create:false}]);
    assert.equal(privileges.membership.length,0);assert.ok(privileges.tables.every(t=>t.owner!=='skyra_org_runtime'));assert.ok(privileges.role.every(r=>!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolinherit&&!r.rolbypassrls));
  }finally {await admin.end();}
  const finalLedger=(await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;assert.deepEqual(finalLedger,ledger);
  const {stage}=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-rehearsal/active-stage.json'),'utf8'));
  assert.ok(path.resolve(stage).startsWith(path.join(root,'.tmp/feature001a-rehearsal')+path.sep));
  const require=createRequire(path.join(root,'apps/admin-service/package.json'));
  for(const args of [['validate'],['migrate','status'],['migrate','deploy']]) {
    const checked=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await checked.end();
    const result=spawnSync(process.execPath,[require.resolve('prisma'),...args,'--schema',path.join(stage,'schema.prisma')],{env,cwd:root,encoding:'utf8',windowsHide:true,timeout:45000});
    assert.equal(result.status,0,`Prisma ${args.join(' ')} failed`);
    fs.writeFileSync(path.join(evidence,`prisma-${args.join('-')}.log`),((result.stdout||'')+(result.stderr||'')).replaceAll(env.ISOLATED_DATABASE_URL,'[isolated URL redacted]'));
  }
  assert.equal(await schema(),before);assert.deepEqual((await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows,ledger);
  checks.push('Prisma validate/status/final-chain repeat deploy pass with unchanged final catalog and ledger');
  fs.writeFileSync(path.join(evidence,'readiness.json'),JSON.stringify({at:new Date().toISOString(),git:{branch:git('branch','--show-current').output,head:git('rev-parse','HEAD').output,staged:git('diff','--cached','--name-only').output},artifacts,reports,configuration,ledger,privileges,checks},null,2));
  console.log(JSON.stringify({artifacts,checks,configuredRealOidcIssuer:configuration.process.OIDC_ISSUER_URL!=='UNSET'},null,2));
} finally {await client.end();}
