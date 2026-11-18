import {verifyProjectMigration} from './lib/project-migration-integrity.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';
const state=readState(),env=testEnvironment(state),owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),admin=await isolatedAdminClient(state);
const evidence=path.join(root,'.tmp/feature003-evidence');fs.mkdirSync(evidence,{recursive:true});
const name='20261104010000_feature003_projects',sql=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-003-001/migration.sql')),grants=fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-003-002/runtime-privileges.sql'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),require=createRequire(path.join(root,'apps/admin-service/package.json'));
const cli=(args,schema)=>{const r=spawnSync(process.execPath,[require.resolve('prisma'),...args,'--schema',schema],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:45000});fs.writeFileSync(path.join(evidence,'prisma-'+args.slice(0,2).join('-')+'.log'),(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,'Prisma command failed; inspect local log');};
try{
  const ledger=(await owner.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;assert.ok(ledger.some(r=>r.migration_name==='20261104000000_feature002_membership_integrity'));
  const badQuota=(await owner.query('SELECT count(*)::int AS n FROM project_quotas q LEFT JOIN projects p ON p.tenant_id=q.tenant_id AND p.id=q.project_id WHERE p.id IS NULL')).rows[0].n;assert.equal(badQuota,0,'Existing quota inconsistencies require review; never delete unknown records');
  const applied=ledger.find(r=>r.migration_name===name);
  if(!applied){
    await assert.rejects(owner.query(sql.toString().replace(/COMMIT;\s*$/,'SELECT * FROM feature003_intentional_failure; COMMIT;')),{code:'42P01'});await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regclass('public.projects_tenant_created_id_idx') AS index,to_regprocedure('public.preserve_project_identity()') AS function")).rows[0].index,null);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='project_quotas_tenant_project_fkey'")).rows[0].n,0);
    assert.equal((await owner.query("SELECT to_regprocedure('public.preserve_project_identity()') AS function")).rows[0].function,null);
    await owner.query(sql.toString());
  }else assert.equal(applied.checksum,hash(sql),'Applied migration bytes differ');
  const {stage}=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-rehearsal/active-stage.json'),'utf8'));assert.ok(path.resolve(stage).startsWith(path.join(root,'.tmp/feature001a-rehearsal')+path.sep));
  const schema=path.join(root,'apps/ingestion-gateway/prisma/schema.prisma');fs.copyFileSync(schema,path.join(root,'apps/query-service/prisma/schema.prisma'));fs.copyFileSync(schema,path.join(stage,'schema.prisma'));fs.mkdirSync(path.join(stage,'migrations',name),{recursive:true});fs.writeFileSync(path.join(stage,'migrations',name,'migration.sql'),sql);
  if(!applied)cli(['migrate','resolve','--applied',name],path.join(stage,'schema.prisma'));cli(['validate'],schema);cli(['generate'],schema);cli(['migrate','deploy'],path.join(stage,'schema.prisma'));
  await verifyProjectMigration(owner,sql);
  await admin.query(grants.toString());await admin.query(grants.toString());
  const seeded=spawnSync(process.execPath,['scripts/prepare-members-tests.mjs'],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:60000});fs.writeFileSync(path.join(evidence,'fixture-prerequisite.log'),(seeded.stdout||'')+(seeded.stderr||''));assert.equal(seeded.status,0,'Member fixture prerequisite failed');
  const f=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature002-evidence/fixtures.json'),'utf8'));const prefix='project-'+crypto.randomUUID().slice(0,8);
  f.projectPrefix=prefix;f.projects=[];
  for(let i=0;i<17;i++){const id=prefix+'-'+String(i).padStart(2,'0');await owner.query("INSERT INTO projects(id,tenant_id,name,status,updated_at) VALUES($1,$2,$3,$4,now())",[id,f.tenantA,'Project '+String(i).padStart(2,'0'),i===15?'SUSPENDED':i===16?'ARCHIVED':'ACTIVE']);f.projects.push(id);}
  for(const [label,role]of [['projectAdmin','ProjectAdmin'],['developer','Developer']]){
    await owner.query('DELETE FROM role_assignments WHERE tenant_id=$1 AND user_id=$2',[f.tenantA,f.users[label].id]);
    await owner.query('INSERT INTO project_memberships(tenant_id,user_id,project_id) VALUES($1,$2,$3)',[f.tenantA,f.users[label].id,f.projects[0]]);
    await owner.query('INSERT INTO role_assignments(tenant_id,user_id,project_id,role_id) SELECT $1,$2,$3,id FROM roles WHERE name=$4',[f.tenantA,f.users[label].id,f.projects[0],role]);
  }
  fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify(f,null,2));
  const current=(await owner.query('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name')).rows;assert.equal(current.find(r=>r.migration_name===name).checksum,hash(sql));
  const result={migration:{name,bytes:sql.length,sha256:hash(sql)},grants:{bytes:grants.length,sha256:hash(grants)},preflight:{badQuota},ledger:current,rollbackVerified:true};fs.writeFileSync(path.join(evidence,'migration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await owner.end();await admin.end();}
