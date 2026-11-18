import {SessionStoreService} from '../../src/modules/auth/application/session-store.service.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { OidcService } from '../../src/modules/auth/application/oidc.service.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
test('OIDC validates cryptographic signatures and rejects none/forged algorithms', () => {
  const config = new BffConfigService(), service = new OidcService(config,SessionStoreService.forIsolatedTests());
  const payload = Buffer.from(JSON.stringify({ iss: config.oidcIssuerUrl, aud: config.oidcClientId, sub: 'identity-subject', nonce: 'nonce', exp: Math.floor(Date.now()/1000)+60 })).toString('base64url');
  const mint = (alg: string, secret: string) => { const h=Buffer.from(JSON.stringify({alg})).toString('base64url');return `${h}.${payload}.${createHmac('sha256',secret).update(`${h}.${payload}`).digest('base64url')}`; };
  assert.equal(service.verifyIdToken(mint('HS256',config.oidcClientSecret),'nonce',config.oidcIssuerUrl,config.oidcClientId).id,'identity-subject');
  for(const [alg,key] of [['none',config.oidcClientSecret],['HS256','forged-key'],['RS256',config.oidcClientSecret]]) assert.throws(()=>service.verifyIdToken(mint(alg!,key!),'nonce',config.oidcIssuerUrl,config.oidcClientId));
});
