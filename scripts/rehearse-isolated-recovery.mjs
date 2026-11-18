// No configurable target, no protected URL, no --clean, and no reuse of an existing database.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { root, readState, testEnvironment, isolatedAdminClient } from './isolated-postgres.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const state=readState(), env=testEnvironment(state), runId=crypto.randomUUID();
const source=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);
const physical=await isolatedAdminClient(state);await physical.end();
const directory=path.join(root,'.tmp/feature001a-postgres/recovery',runId);
fs.mkdirSync(directory,{recursive:true,mode:0o700});
if(!fs.realpathSync(directory).startsWith(fs.realpathSync(path.join(root,'.tmp/feature001a-postgres'))+path.sep))throw Error('Redirected recovery destination');
const dump=path.join(directory,'isolated.dump');
const report={runId,host:'127.0.0.1',port:state.port,clusterId:state.clusterId,dataDirectory:state.data,source:state.database,checks:[]};
const check=(name)=>{report.checks.push(name);console.log(`PASS ${name}`);};
function pg(binary,args,expectSuccess=true) {
  const result=spawnSync(path.join(state.bin,`${binary}${process.platform==='win32'?'.exe':''}`),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024,
    env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(state.port),PGUSER:'skyra_test_admin',PGDATABASE:state.database,PGPASSWORD:state.adminPassword,PGCONNECT_TIMEOUT:'3'}});
  if(expectSuccess)assert.equal(result.status,0,`${binary} failed (${result.error?.code||result.status}); private diagnostics withheld`);
  return result;
}
async function snapshot(client) {
  const schema={};
  for(const [key,sql] of Object.entries({
    columns:"SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
    constraints:"SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
    indexes:"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2",
    enums:"SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace ORDER BY t.typname,e.enumsortorder",
    triggers:"SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY 1,2",
    functions:"SELECT proname,pg_get_functiondef(oid) AS definition,proacl::text FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname",
    ownership:"SELECT relname,pg_get_userbyid(relowner) AS owner,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname",
    defaultPrivileges:"SELECT defaclrole::regrole::text,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2"
  }))schema[key]=(await client.query(sql)).rows;
  const ledger=(await client.query('SELECT * FROM public._prisma_migrations ORDER BY migration_name,id')).rows;
  const data=[];
  for(const {tablename} of (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
    const identifier='"'+tablename.replaceAll('"','""')+'"';
    data.push({table:tablename,...(await client.query(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM public.${identifier} t`)).rows[0]});
  }
  return {schema,ledger,data};
}
async function createTarget(suffix) {
  const database=`skyra_recovery_${runId.replaceAll('-','')}_${suffix}`;
  assert.match(database,/^skyra_recovery_[a-f0-9]{32}_[ab]$/);
  const admin=await isolatedAdminClient(state,'postgres');
  try {
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Refuse any existing database');
    await admin.query(`CREATE DATABASE "${database}" OWNER skyra_isolated_user TEMPLATE template0`);
    await admin.query(`COMMENT ON DATABASE "${database}" IS 'feature001c:${runId}:${state.clusterId}'`);
  } finally {await admin.end();}
  const manifest={database,runId,clusterId:state.clusterId,port:state.port,data:state.data};
  fs.writeFileSync(path.join(directory,`${suffix}-target.json`),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return manifest;
}
async function target(manifest) {
  assert.equal(manifest.runId,runId);assert.equal(manifest.clusterId,state.clusterId);
  assert.equal(manifest.port,state.port);assert.notEqual(manifest.port,5432);assert.equal(manifest.data,state.data);
  assert.match(manifest.database,new RegExp(`^skyra_recovery_${runId.replaceAll('-','')}_[ab]$`));
  const client=await isolatedAdminClient(readState(),manifest.database);
  try {
    const row=(await client.query("SELECT pg_get_userbyid(datdba) AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()" )).rows[0];
    assert.equal(row.owner,'skyra_isolated_user');assert.equal(row.marker,`feature001c:${runId}:${state.clusterId}`);
    return client;
  } catch(error) {await client.end();throw error;}
}
try {
  report.tools={pg_dump:pg('pg_dump',['--version']).stdout.trim(),pg_restore:pg('pg_restore',['--version']).stdout.trim()};
  const before=await snapshot(source);assert.equal(before.ledger.length,4);
  // Capture a consistent custom-format archive of the verified disposable database only.
  pg('pg_dump',['-h','127.0.0.1','-p',String(state.port),'-U','skyra_test_admin','-d',state.database,'-Fc','--file',dump]);
  report.archive={path:path.relative(root,dump),bytes:fs.statSync(dump).size,sha256:hash(fs.readFileSync(dump))};
  assert.ok(report.archive.bytes>0);pg('pg_restore',['--list',dump]);check('custom archive created, SHA-256 recorded and TOC readable');
  const manifest=await createTarget('a');report.restoreDatabase=manifest.database;
  const verified=await target(manifest);assert.equal((await verified.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);await verified.end();
  assert.equal(hash(fs.readFileSync(dump)),report.archive.sha256);
  pg('pg_restore',['-h','127.0.0.1','-p',String(state.port),'-U','skyra_test_admin','-d',manifest.database,'--exit-on-error','--single-transaction',dump]);
  const restored=await target(manifest);
  try {
    assert.deepEqual((await restored.query('SELECT cluster_id FROM skyra_test.environment_identity')).rows,[{cluster_id:state.clusterId}]);
    const after=await snapshot(restored);assert.deepEqual(after,before);
    report.snapshot={schemaSha256:hash(JSON.stringify(before.schema)),ledgerSha256:hash(JSON.stringify(before.ledger)),data:before.data};
    check('new independently guarded target restores schema, ownership, ACLs, triggers, ledger and every public row digest');
    const runtimeSecret=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-postgres/organization-runtime.json'),'utf8'));
    assert.equal(runtimeSecret.clusterId,state.clusterId);
    const runtimeUrl=new URL(`postgresql://skyra_org_runtime@127.0.0.1:${state.port}/${manifest.database}`);runtimeUrl.password=runtimeSecret.password;
    const runtime=new Client({connectionString:runtimeUrl.href,connectionTimeoutMillis:3000,statement_timeout:10000});await runtime.connect();
    try {
      assert.equal((await runtime.query('SELECT current_user AS role,current_database() AS db,inet_server_port() AS port')).rows[0].role,'skyra_org_runtime');
      const role=(await restored.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,(SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships FROM pg_roles r WHERE rolname='skyra_org_runtime'")).rows[0];
      assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,memberships:0});report.runtimeRole=role;
      for(const sql of ["UPDATE admin_audit_events SET actor_email='forbidden'","DELETE FROM admin_audit_events","TRUNCATE admin_audit_events","DELETE FROM tenants","ALTER TABLE tenants ADD COLUMN forbidden int","DROP TABLE tenants","ALTER TABLE admin_audit_events DISABLE TRIGGER ALL"]) {
        await assert.rejects(runtime.query(sql),{code:'42501'});
      }
      check('ordinary runtime refuses audit UPDATE/DELETE/TRUNCATE, tenant DELETE, ALTER, DROP and trigger disabling');
    } finally {await runtime.end();}
    const {AdminConfigService}=await import('../apps/admin-service/dist/core/config/admin-config.service.js');
    const {OrganizationService}=await import('../apps/admin-service/dist/modules/organization/organization.service.js');
    const {EffectivePermissionResolver}=await import('../apps/admin-service/dist/modules/authorization/application/effective-permission.resolver.js');
    const {adminPrisma}=await import('../apps/admin-service/dist/core/database/admin-prisma.js');
    const fixtures=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001b-evidence/fixtures.json'),'utf8'));
    const config=new AdminConfigService({ADMIN_PERSISTENCE_ENABLED:'true',DATABASE_URL:runtimeUrl.href,TRUSTED_OIDC_ISSUERS:fixtures.issuer});
    const service=new OrganizationService(config,new EffectivePermissionResolver());
    const principal={sub:fixtures.users.owner.subject,identityIssuer:fixtures.issuer,scope:'organization',tenantId:fixtures.tenantA,roles:[]};
    try {
      const read=await service.read(principal,fixtures.tenantA);
      const updated=await service.update(principal,fixtures.tenantA,{name:'Recovery Sanity Organization'},read.etag,`recovery-${runId}`);
      assert.equal(updated.tenant.name,'Recovery Sanity Organization');
      assert.equal((await restored.query("SELECT count(*)::int AS n FROM admin_audit_events WHERE details->>'correlationId'=$1",[`recovery-${runId}`])).rows[0].n,1);
      check('restored application service reads and performs authorized optimistic update plus durable audit as non-owner runtime');
    } finally {await adminPrisma(config).$disconnect();}
  } finally {await restored.end();}
  const failedManifest=await createTarget('b');report.failureDatabase=failedManifest.database;
  const bad=path.join(directory,'corrupt.dump');fs.writeFileSync(bad,Buffer.from('corrupt isolated archive'));
  assert.notEqual(hash(fs.readFileSync(bad)),report.archive.sha256);check('checksum preflight refuses altered archive before restore');
  const failureTarget=await target(failedManifest);await failureTarget.end();
  const result=pg('pg_restore',['-h','127.0.0.1','-p',String(state.port),'-U','skyra_test_admin','-d',failedManifest.database,'--exit-on-error','--single-transaction',bad],false);
  assert.notEqual(result.status,0);
  const empty=await target(failedManifest);try {assert.equal((await empty.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);}finally {await empty.end();}
  check('corrupt archive restore fails nonzero and leaves newly owned failure target empty');
  await assert.rejects(target({...manifest,port:5432}));await assert.rejects(target({...manifest,database:state.database}));
  check('restore guard rejects protected port and unowned database before connection');
  assert.deepEqual(await snapshot(source),before);check('source remains unchanged by backup and restore');
  report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'recovery.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(root,'.tmp/feature001c-evidence/recovery.json'),JSON.stringify(report,null,2));
  console.log('Recovery evidence saved; owned restored databases retained for inspection, no protected backup created.');
} finally {await source.end();}
