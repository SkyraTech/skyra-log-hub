import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {root,readState,testEnvironment,isolatedAdminClient} from '../../scripts/isolated-postgres.mjs';import {connectIsolatedClient,connectIsolatedRuntimeClient} from '../../scripts/lib/isolated-target.mjs';
import {AdminConfigService} from '../../apps/admin-service/dist/core/config/admin-config.service.js';import {adminPrisma} from '../../apps/admin-service/dist/core/database/admin-prisma.js';import {ProjectsService} from '../../apps/admin-service/dist/modules/projects/projects.service.js';import {EffectivePermissionResolver} from '../../apps/admin-service/dist/modules/authorization/application/effective-permission.resolver.js';
import {ProjectService as IngestionProjectService} from '../../apps/ingestion-gateway/dist/projects/project.service.js';import {PrismaProjectRepository} from '../../apps/ingestion-gateway/dist/metadata/repositories/prisma-project.repository.js';import {PrismaQuotaRepository} from '../../apps/ingestion-gateway/dist/metadata/repositories/prisma-quota.repository.js';
test('real persisted lifecycle blocks actual ingestion project admission without revoking credentials or deleting references',async()=>{
  const state=readState(),env=testEnvironment(state),owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),physical=await isolatedAdminClient(state);await physical.end();
  const f=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature003-evidence/fixtures.json'),'utf8')),secret=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-postgres/organization-runtime.json'),'utf8')),url=new URL(env.ISOLATED_DATABASE_URL);url.username='skyra_org_runtime';url.password=secret.password;const runtime=await connectIsolatedRuntimeClient(url.href,env);
  const config=new AdminConfigService({ADMIN_PERSISTENCE_ENABLED:'true',DATABASE_URL:url.href,TRUSTED_OIDC_ISSUERS:f.issuer}),admin=new ProjectsService(config,new EffectivePermissionResolver());
  const require=createRequire(path.join(root,'apps/ingestion-gateway/package.json')),{PrismaClient}=require('@prisma/client'),reader=new PrismaClient({datasources:{db:{url:env.ISOLATED_DATABASE_URL}}});const admission=new IngestionProjectService(new PrismaProjectRepository(reader),new PrismaQuotaRepository(reader));
  const principal={sub:f.users.owner.subject,identityIssuer:f.issuer,tenantId:f.tenantA,scope:'projects.manage',roles:[]};
  const credentialDigest=async()=> (await owner.query("SELECT md5(coalesce(string_agg(row_to_json(c)::text,'' ORDER BY id),'')) AS digest FROM ingestion_credentials c")).rows[0].digest;
  try{
    const before=await credentialDigest();let v=await admin.create(principal,f.tenantA,{id:'admission-'+crypto.randomUUID(),name:'Admission Lifecycle'},'admission-create');await owner.query('INSERT INTO project_quotas(tenant_id,project_id,updated_at) VALUES($1,$2,now())',[f.tenantA,v.id]);
    // Represents an already authenticated machine identity; no credential generation.
    const identity={tenantId:f.tenantA,allowedProjects:[v.id],allowedEnvironments:['production']};
    assert.equal((await admission.authorizeProjectAccess(v.id,'production',identity)).project.status,'ACTIVE');
    v=await admin.update(principal,f.tenantA,v.id,{status:'SUSPENDED'},v.version,'admission-suspend');await assert.rejects(admission.authorizeProjectAccess(v.id,'production',identity),e=>e.getStatus()===403);
    v=await admin.update(principal,f.tenantA,v.id,{status:'ACTIVE'},v.version,'admission-restore');assert.equal((await admission.authorizeProjectAccess(v.id,'production',identity)).quota.projectId,v.id);
    v=await admin.update(principal,f.tenantA,v.id,{status:'ARCHIVED'},v.version,'admission-archive');await assert.rejects(admission.authorizeProjectAccess(v.id,'production',identity),e=>e.getStatus()===403);
    assert.equal(await credentialDigest(),before);assert.equal((await owner.query('SELECT count(*)::int AS n FROM project_quotas WHERE project_id=$1',[v.id])).rows[0].n,1);
  }finally{await reader.$disconnect();await adminPrisma(config).$disconnect();await runtime.end();await owner.end();}
});
