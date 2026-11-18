import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';
const state=readState(),env=testEnvironment(state),client=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);
const admin=await isolatedAdminClient(state),directory=path.join(root,'.tmp/feature002-evidence');fs.mkdirSync(directory,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const name='20261104000000_feature002_membership_integrity',sql=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-002-001/migration.sql'));
const grants=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-002-002/runtime-privileges.sql'));
const schema=path.join(root,'apps/ingestion-gateway/prisma/schema.prisma');
fs.copyFileSync(schema,path.join(root,'apps/query-service/prisma/schema.prisma'));
const require=createRequire(path.join(root,'apps/admin-service/package.json'));
const cli=async(args,file)=>{const checked=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await checked.end();const r=spawnSync(process.execPath,[require.resolve('prisma'),...args,'--schema',file],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:45000});fs.writeFileSync(path.join(directory,`prisma-${args.slice(0,2).join('-')}.log`),(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,'Prisma '+args.join(' ')+' failed; inspect sanitized local log');};
try{
  const ledger=(await client.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;
  assert.ok(ledger.some(r=>r.migration_name==='20261103010000_feature001b_tenant_consistency'));
  const orphan=(await client.query('SELECT count(*)::int AS n FROM role_assignments r LEFT JOIN tenant_memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.user_id WHERE m.id IS NULL')).rows[0].n;
  assert.equal(orphan,0,'Existing assignments lack membership: stop, do not clean unknown rows');
  const badScope=(await client.query("SELECT count(*)::int AS n FROM role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.project_id IS NOT NULL AND r.name IN ('OrgOwner','OrgAdmin')")).rows[0].n;assert.equal(badScope,0,'Existing invalid role scopes need separate review');
  const applied=ledger.find(r=>r.migration_name===name);
  const catalog=async()=>hash(JSON.stringify((await client.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows));
  if(!applied){const before=await catalog();await assert.rejects(client.query(sql.toString().replace(/COMMIT;\s*$/,'SELECT * FROM feature002_intentional_failure; COMMIT;')),{code:'42P01'});await client.query('ROLLBACK');assert.equal(await catalog(),before);assert.equal((await client.query("SELECT to_regprocedure('public.enforce_admin_role_scope()') AS function")).rows[0].function,null);await client.query(sql.toString());}
  else assert.equal(applied.checksum,hash(sql),'Applied artifact differs');
  const {stage}=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-rehearsal/active-stage.json'),'utf8'));assert.ok(path.resolve(stage).startsWith(path.join(root,'.tmp/feature001a-rehearsal')+path.sep));
  fs.copyFileSync(schema,path.join(stage,'schema.prisma'));fs.mkdirSync(path.join(stage,'migrations',name),{recursive:true});fs.writeFileSync(path.join(stage,'migrations',name,'migration.sql'),sql);
  if(!applied)await cli(['migrate','resolve','--applied',name],path.join(stage,'schema.prisma'));
  await cli(['validate'],schema);await cli(['generate'],schema);await cli(['migrate','deploy'],path.join(stage,'schema.prisma'));
  assert.equal((await client.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',[name])).rows[0].checksum,hash(sql));
  await admin.query(grants.toString());await admin.query(grants.toString());
  const suffix=crypto.randomUUID(),issuer='https://auth.skyra.dev';
  const tenantA=(await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Members Alpha',now()) RETURNING id",['members-a-'+suffix])).rows[0].id;
  const tenantB=(await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Members Beta',now()) RETURNING id",['members-b-'+suffix])).rows[0].id;
  const users={};
  for(const [label,role,status,identity] of [['owner','OrgOwner','ACTIVE','ACTIVE'],['owner2','OrgOwner','ACTIVE','ACTIVE'],['admin','OrgAdmin','ACTIVE','ACTIVE'],['projectAdmin','ProjectAdmin','ACTIVE','ACTIVE'],['developer','Developer','ACTIVE','ACTIVE'],['viewer','Viewer','ACTIVE','ACTIVE'],['suspended','Developer','SUSPENDED','ACTIVE'],['revoked','Viewer','REVOKED','ACTIVE'],['pending','Viewer','PENDING_INVITE','ACTIVE'],['disabled','Developer','ACTIVE','SUSPENDED'],...Array.from({length:15},(_,i)=>['extra'+i,'Viewer','ACTIVE','ACTIVE'])]){
    const subject=`members-${label}-${suffix}`,id=(await client.query('INSERT INTO users(issuer,subject,email,display_name,status) VALUES($1,$2,$3,$4,$5) RETURNING id',[issuer,subject,label+'@members.test.invalid',label==='viewer'?'Casey Viewer':label==='developer'?'Devin Developer':label,identity])).rows[0].id;
    const membership=(await client.query('INSERT INTO tenant_memberships(tenant_id,user_id,status) VALUES($1,$2,$3) RETURNING id',[tenantA,id,status])).rows[0].id;
    const roleId=(await client.query('SELECT id FROM roles WHERE name=$1',[role])).rows[0].id;
    await client.query('INSERT INTO role_assignments(tenant_id,user_id,role_id) VALUES($1,$2,$3)',[tenantA,id,roleId]);users[label]={id,subject,membership};
  }
  const other=(await client.query("INSERT INTO users(issuer,subject,email,display_name) VALUES($1,$2,'other@members.test.invalid','Other Tenant') RETURNING id",[issuer,'members-other-'+suffix])).rows[0].id;
  const missingSubject='members-missing-'+suffix;
  users.missing={id:(await client.query("INSERT INTO users(issuer,subject,email,display_name) VALUES($1,$2,'missing@members.test.invalid','Missing Membership') RETURNING id",[issuer,missingSubject])).rows[0].id,subject:missingSubject};
  const foreignMembership=(await client.query('INSERT INTO tenant_memberships(tenant_id,user_id) VALUES($1,$2) RETURNING id',[tenantB,other])).rows[0].id;
  const projectA=crypto.randomUUID(),projectB=crypto.randomUUID();for(const [id,tenant]of[[projectA,tenantA],[projectB,tenantB]])await client.query("INSERT INTO projects(id,tenant_id,name,updated_at) VALUES($1,$2,'Member Scope',now())",[id,tenant]);
  await client.query('INSERT INTO project_memberships(tenant_id,user_id,project_id) VALUES($1,$2,$3)',[tenantA,users.viewer.id,projectA]);
  await client.query("INSERT INTO role_assignments(tenant_id,user_id,project_id,role_id) SELECT $1,$2,$3,id FROM roles WHERE name='Developer'",[tenantA,users.viewer.id,projectA]);
  const result={clusterId:state.clusterId,issuer,tenantA,tenantB,users,foreignMembership,projectA,projectB};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify(result,null,2));
  const evidence={migration:{name,bytes:sql.length,sha256:hash(sql)},grants:{bytes:grants.length,sha256:hash(grants)},preflight:{orphan,badScope},failureInjection:'Missing relation before COMMIT rolled back FK/index/function/trigger creation on first application',ledger:(await client.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows};fs.writeFileSync(path.join(directory,'migration.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await admin.end();await client.end();}
