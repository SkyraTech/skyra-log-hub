import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { root, readState, testEnvironment, isolatedAdminClient } from './isolated-postgres.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

const state = readState(), env = testEnvironment(state);
const client = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
const evidence = path.join(root,'.tmp','feature001b-evidence'); fs.mkdirSync(evidence,{recursive:true});
const migration = '20261103010000_feature001b_tenant_consistency';
const artifact = fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-001B-001/migration.sql'));
const sha256 = crypto.createHash('sha256').update(artifact).digest('hex');
try {
  const hardened = await client.query("SELECT migration_name FROM _prisma_migrations WHERE migration_name='20261103000000_feature001a_audit_integrity'");
  if (!hardened.rowCount) throw new Error('Run the existing baseline and audit-hardening rehearsal first');
  const applied = await client.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',[migration]);
  if (!applied.rowCount) {
    const { stage } = JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-rehearsal/active-stage.json'),'utf8'));
    if (!path.resolve(stage).startsWith(path.join(root,'.tmp/feature001a-rehearsal')+path.sep)) throw new Error('Unknown staged migration path');
    const directory = path.join(stage,'migrations',migration); fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'migration.sql'),artifact);
    await client.query(artifact.toString('utf8'));
    const require = createRequire(path.join(root,'apps/admin-service/package.json'));
    const result = spawnSync(process.execPath,[require.resolve('prisma'),'migrate','resolve','--applied',migration,'--schema',path.join(stage,'schema.prisma')],{env,cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
    if (result.status !== 0) throw new Error('Isolated migration bookkeeping failed; inspect staged schema before retry');
  } else if(applied.rows[0].checksum !== sha256) throw new Error('Applied consistency migration checksum differs');
  const secretFile = path.join(root,'.tmp/feature001a-postgres/organization-runtime.json');
  let runtime = fs.existsSync(secretFile) ? JSON.parse(fs.readFileSync(secretFile,'utf8')) : null;
  if (runtime && runtime.clusterId !== state.clusterId) throw new Error('Runtime role ownership differs');
  const admin = await isolatedAdminClient(state);
  try {
    const exists = await admin.query("SELECT rolname FROM pg_roles WHERE rolname='skyra_org_runtime'");
    if (exists.rowCount && !runtime) throw new Error('Refusing an unrecognized existing runtime role');
    if (!runtime) {
      runtime={clusterId:state.clusterId,password:crypto.randomBytes(32).toString('hex')};
      fs.writeFileSync(secretFile,JSON.stringify(runtime),{flag:'wx',mode:0o600});
      await admin.query(`CREATE ROLE skyra_org_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${runtime.password}'`);
    }
    await admin.query('GRANT CONNECT ON DATABASE skyra_loghub_disposable_validation TO skyra_org_runtime');
    await admin.query('GRANT USAGE ON SCHEMA skyra_test TO skyra_org_runtime');
    await admin.query('GRANT SELECT ON skyra_test.environment_identity TO skyra_org_runtime');
    const grants = fs.readFileSync(path.join(root,'docs/admin/migrations/FEATURE-001B-002/runtime-privileges.sql'));
    await admin.query(grants.toString('utf8'));
    fs.writeFileSync(path.join(evidence,'runtime-grants.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(grants).digest('hex'),bytes:grants.length},null,2));
  } finally { await admin.end(); }
  const suffix=crypto.randomUUID(), issuer='https://auth.skyra.dev';
  const tenantA=(await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Organization Alpha',now()) RETURNING id",['org-a-'+suffix])).rows[0].id;
  const tenantB=(await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Organization Beta',now()) RETURNING id",['org-b-'+suffix])).rows[0].id;
  const users={};
  for(const [label,role,status] of [['owner','OrgOwner','ACTIVE'],['admin','OrgAdmin','ACTIVE'],['viewer','Viewer','ACTIVE'],['revoked','OrgOwner','REVOKED'],['suspended','OrgOwner','SUSPENDED'],['missing','OrgOwner',null],['disabled','OrgOwner','ACTIVE']]) {
    const subject=`org-${label}-${suffix}`;
    const id=(await client.query("INSERT INTO users(issuer,subject,email,display_name,status) VALUES($1,$2,$3,$4,$5) RETURNING id",[issuer,subject,`${label}@test.invalid`,label,label==='disabled'?'SUSPENDED':'ACTIVE'])).rows[0].id;
    users[label]={id,subject};
    if(status) {
      await client.query('INSERT INTO tenant_memberships(tenant_id,user_id,status) VALUES($1,$2,$3)',[tenantA,id,status]);
      const roleId=(await client.query('SELECT id FROM roles WHERE name=$1',[role])).rows[0]?.id;
      if(!roleId) throw new Error('Expected existing isolated standard roles; run original database tests before preparing feature fixtures');
      await client.query('INSERT INTO role_assignments(tenant_id,user_id,role_id) VALUES($1,$2,$3)',[tenantA,id,roleId]);
    }
  }
  const result={issuer,tenantA,tenantB,users,migration:{name:migration,sha256,bytes:artifact.length}};
  fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify(result,null,2));
  console.log('Prepared isolated organization fixtures and a separate non-owner runtime role; credentials are restricted and not printed.');
  console.log(JSON.stringify(result.migration));
} finally {await client.end();}
