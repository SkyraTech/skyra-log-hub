import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';
import {connectIsolatedClient,connectIsolatedIngestionRuntimeClient,connectIsolatedRuntimeClient} from './lib/isolated-target.mjs';
import {verifyCredentialMigration} from './lib/credential-migration-integrity.mjs';
const state=readState(),env=testEnvironment(state),owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),admin=await isolatedAdminClient(state);
const evidence=path.join(root,'.tmp/feature008-evidence');fs.mkdirSync(evidence,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),sql=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-008-001/migration.sql')),name='20261106000000_feature008_quotas';
const require=createRequire(path.join(root,'apps/admin-service/package.json'));
const cli=(args,schema)=>{const r=spawnSync(process.execPath,[require.resolve('prisma'),...args,'--schema',schema],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:60000});fs.writeFileSync(path.join(evidence,'prisma-'+args.join('-')+'.log'),(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,'Prisma failed; inspect FEATURE-008 log');};
try{
  await verifyCredentialMigration(owner,fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-004-001/migration.sql')));
  const ledger=(await owner.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;assert.ok([7,8,9].includes(ledger.length));
  const applied=ledger.find(r=>r.migration_name===name);let rollbackVerified=false;
  if(!applied){
    await assert.rejects(owner.query(sql.toString().replace(/COMMIT;\s*$/,'SELECT * FROM feature008_injected_failure; COMMIT;')),{code:'42P01'});await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regclass('project_usage_windows') AS t")).rows[0].t,null);rollbackVerified=true;await owner.query(sql.toString());
  }else assert.equal(applied.checksum,hash(sql));
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-rehearsal/active-stage.json'))).stage;
  assert.ok(path.resolve(prior).startsWith(path.join(root,'.tmp/feature001a-rehearsal')+path.sep));
  const stage=path.join(evidence,'prisma');fs.mkdirSync(stage,{recursive:true});fs.cpSync(path.join(prior,'migrations'),path.join(stage,'migrations'),{recursive:true});
  const schema=path.join(stage,'schema.prisma');fs.copyFileSync(path.join(root,'apps/ingestion-gateway/prisma/schema.prisma'),schema);
  fs.mkdirSync(path.join(stage,'migrations',name),{recursive:true});fs.writeFileSync(path.join(stage,'migrations',name,'migration.sql'),sql);
  if(!applied)cli(['migrate','resolve','--applied',name],schema);
  const lockName='20261106010000_feature008_lock_authority',lockSql=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-008-003/migration.sql'));
  const lockApplied=ledger.find(r=>r.migration_name===lockName);
  if(lockApplied)assert.equal(lockApplied.checksum,hash(lockSql));else await owner.query(lockSql.toString());
  fs.mkdirSync(path.join(stage,'migrations',lockName),{recursive:true});fs.writeFileSync(path.join(stage,'migrations',lockName,'migration.sql'),lockSql);
  if(!lockApplied)cli(['migrate','resolve','--applied',lockName],schema);
  cli(['validate'],schema);cli(['generate'],path.join(root,'apps/ingestion-gateway/prisma/schema.prisma'));cli(['migrate','deploy'],schema);cli(['migrate','deploy'],schema);
  const grants=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-008-002/runtime-privileges.sql'));await admin.query(grants.toString());await admin.query(grants.toString());
  for(const [role,file,connect]of [['skyra_ingestion_runtime','.tmp/feature004-postgres/gateway-runtime.json',connectIsolatedIngestionRuntimeClient],['skyra_org_runtime','.tmp/feature001a-postgres/organization-runtime.json',connectIsolatedRuntimeClient]]){
    const secret=JSON.parse(fs.readFileSync(path.join(root,file)));assert.equal(secret.clusterId,state.clusterId);const url=new URL(env.ISOLATED_DATABASE_URL);url.username=role;url.password=secret.password;const c=await connect(url.href,env);
    if(role==='skyra_ingestion_runtime'){assert.equal((await c.query("SELECT has_table_privilege(current_user,'project_quotas','UPDATE') AS p")).rows[0].p,false);assert.equal((await c.query("SELECT has_table_privilege(current_user,'admin_audit_events','INSERT') AS p")).rows[0].p,false);}
    else assert.equal((await c.query("SELECT has_column_privilege(current_user,'ingestion_credentials','key_hash','SELECT') AS p")).rows[0].p,false);await c.end();
  }
  const after=(await owner.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;assert.equal(after.length,9);for(const row of ledger)assert.deepEqual(after.find(a=>a.migration_name===row.migration_name),row);
  assert.equal(after.find(r=>r.migration_name===name).checksum,hash(sql));
  const result={migration:{name,sha256:hash(sql)},grantsSha256:hash(grants),ledger:after,rollbackVerified:rollbackVerified||JSON.parse(fs.readFileSync(path.join(evidence,'migration.json'))).rollbackVerified,repeatDeploy:true,runtimeLeastPrivilege:true,protectedWrites:false};fs.writeFileSync(path.join(evidence,'migration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await owner.end();await admin.end();}
