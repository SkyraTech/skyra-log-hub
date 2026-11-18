import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, testEnvironment } from '../../scripts/isolated-postgres.mjs';
import { connectIsolatedClient } from '../../scripts/lib/isolated-target.mjs';
import { AdminConfigService } from '../../apps/admin-service/dist/core/config/admin-config.service.js';
import { adminPrisma } from '../../apps/admin-service/dist/core/database/admin-prisma.js';
import { PrismaIdentityRepository } from '../../apps/admin-service/dist/modules/identity/infrastructure/prisma-identity.repository.js';
import { PrismaMembershipRepository } from '../../apps/admin-service/dist/modules/membership/infrastructure/prisma-membership.repository.js';
import { PrismaAuditRepository } from '../../apps/admin-service/dist/core/audit/infrastructure/prisma-audit.repository.js';
import { IdentityService } from '../../apps/admin-service/dist/modules/identity/application/identity.service.js';
import { EffectivePermissionResolver } from '../../apps/admin-service/dist/modules/authorization/application/effective-permission.resolver.js';
import { MembershipService } from '../../apps/admin-service/dist/modules/membership/application/membership.service.js';

test('persistent administration adapters against verified PostgreSQL', async t => {
  const env=testEnvironment(), owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001b-evidence/fixtures.json'),'utf8'));
  const config=new AdminConfigService({ADMIN_PERSISTENCE_ENABLED:'true',DATABASE_URL:env.ISOLATED_DATABASE_URL,TRUSTED_OIDC_ISSUERS:fixture.issuer});
  const identities=new PrismaIdentityRepository(config), memberships=new PrismaMembershipRepository(config), audit=new PrismaAuditRepository(config);
  const identity=new IdentityService(identities,config), membership=new MembershipService(memberships,audit,new EffectivePermissionResolver());
  try {
    await t.test('issuer/subject lookup resolves persisted identity',async()=>assert.equal((await identity.resolveIdentity(fixture.issuer,fixture.users.owner.subject)).id,fixture.users.owner.id));
    await t.test('untrusted issuer and disabled identity are rejected',async()=>{
      await assert.rejects(identity.resolveIdentity('https://untrusted.invalid',fixture.users.owner.subject));
      await assert.rejects(identity.resolveIdentity(fixture.issuer,fixture.users.disabled.subject));
    });
    await t.test('active tenant membership resolves persisted role assignments',async()=>assert.ok((await membership.resolveUserMemberships(fixture.tenantA,fixture.users.owner.id)).tenantRoles.includes('OrgOwner')));
    await t.test('missing, suspended and revoked memberships are rejected',async()=>{for(const key of ['missing','suspended','revoked'])await assert.rejects(membership.resolveUserMemberships(fixture.tenantA,fixture.users[key].id));});
    await t.test('cross-tenant membership lookup returns no record',async()=>assert.equal(await memberships.findTenantMembership(fixture.tenantB,fixture.users.owner.id),null));
    await t.test('persistent last-owner invariant rejects revocation',async()=>{
      assert.equal(await memberships.countTenantOwners(fixture.tenantA),1);
      await assert.rejects(memberships.revokeTenantMembership(fixture.tenantA,fixture.users.owner.id));
      assert.equal((await memberships.findTenantMembership(fixture.tenantA,fixture.users.owner.id)).status,'ACTIVE');
    });
    await t.test('identity issuer/subject uniqueness rejects a second identity',async()=>{
      const original=await identities.findById(fixture.users.owner.id);
      await assert.rejects(identities.save({...original,id:crypto.randomUUID()}),error=>error.code==='P2002');
    });
    await t.test('audit adapter reads durable records and redacts new event details',async()=>{
      const saved=await audit.recordAuditEvent({tenantId:fixture.tenantA,actorUserId:fixture.users.owner.id,actorEmail:'owner@test.invalid',action:'TENANT_UPDATED',targetType:'tenant',targetId:fixture.tenantA,details:{password:'never-persist-this',note:'adapter test'},createdAt:new Date()});
      assert.equal(saved.details.password,'[REDACTED]');assert.ok((await audit.listAuditEvents(fixture.tenantA)).some(row=>row.id===saved.id));
    });
    await t.test('name database constraint rejects a whitespace-only display name',async()=>await assert.rejects(owner.query("UPDATE tenants SET name=' ' WHERE id=$1",[fixture.tenantA]),{code:'23514'}));
  } finally {await adminPrisma(config).$disconnect();await owner.end();}
});
