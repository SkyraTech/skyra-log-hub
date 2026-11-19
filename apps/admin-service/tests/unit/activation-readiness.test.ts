import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';
import { adminPrisma } from '../../src/core/database/admin-prisma.js';
import { TrustedAssertionGuard } from '../../src/core/security/trusted-assertion.guard.js';
import { createHmac } from 'node:crypto';

test('missing activation flag or database URL refuses persistence before opening a connection',()=>{
  for(const env of [{},{DATABASE_URL:'postgresql://unused.invalid/db'},{ADMIN_PERSISTENCE_ENABLED:'true'}])assert.throws(()=>adminPrisma(new AdminConfigService(env)),/not activated/);
});
test('organization assertion refuses default internal signing key without explicit configuration',()=>{
  const config=new AdminConfigService();
  const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({iss:config.internalJwtIssuer,aud:config.internalJwtAudience,sub:'subject',tenant_id:'tenant',identity_issuer:'https://auth.skyra.internal',scope:'organization',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const s=createHmac('sha256',config.internalJwtSecret).update(`${h}.${p}`).digest('base64url');
  assert.throws(()=>new TrustedAssertionGuard(config).verifyAssertionToken(`${h}.${p}.${s}`));
});
test('production Admin configuration rejects the built-in internal signer',()=>{
  assert.throws(()=>new AdminConfigService({NODE_ENV:'production'}),/INTERNAL_JWT_SECRET/);
  assert.doesNotThrow(()=>new AdminConfigService({NODE_ENV:'production',INTERNAL_JWT_SECRET:'synthetic-production-admin-key-32-characters'}));
});
