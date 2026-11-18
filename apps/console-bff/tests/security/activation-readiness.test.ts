import {SessionStoreService} from '../../src/modules/auth/application/session-store.service.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import { OidcService } from '../../src/modules/auth/application/oidc.service.js';
import { AdminClientService } from '../../src/modules/auth/application/admin-client.service.js';
import { OidcProvider } from '../../src/modules/auth/application/oidc-provider.js';

const activation = { NODE_ENV:'production', BFF_USE_AUTHORITATIVE_MEMBERSHIP:'true', ENABLE_MOCK_OIDC:'false',
  OIDC_DISCOVERY_URL:'https://issuer.test.invalid/realm/.well-known/openid-configuration', OIDC_TRUSTED_ENDPOINT_ORIGINS:'https://issuer.test.invalid',OIDC_TENANT_ID:'11111111-2222-4333-8444-555555555555',
  OIDC_ISSUER_URL:'https://issuer.test.invalid/realm', OIDC_CLIENT_ID:'readiness-client', OIDC_REDIRECT_URI:'https://console.test.invalid/bff/auth/callback',
  ADMIN_SERVICE_URL:'https://admin.test.invalid', BFF_ALLOWED_ORIGINS:'https://console.test.invalid',
  OIDC_CLIENT_SECRET:'synthetic-provider-key-for-tests-only-32', INTERNAL_JWT_SECRET:'synthetic-internal-key-for-tests-only-32',
  SESSION_SECRET:'synthetic-session-key-for-tests-only-32', CSRF_SECRET:'synthetic-csrf-key-for-tests-only-32' };
function environment(values: Record<string,string|undefined>, run:()=>void) {
  const before={...process.env};try { for(const [key,value] of Object.entries(values)) {if(value===undefined)delete process.env[key];else process.env[key]=value;} run(); }
  finally { for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key]; Object.assign(process.env,before); }
}
test('authoritative production configuration refuses each missing trust root or secret',()=>{
  environment(activation,()=>assert.equal(new BffConfigService().cookieSecure,true));
  for(const key of Object.keys(activation).filter(k=>!['NODE_ENV','BFF_USE_AUTHORITATIVE_MEMBERSHIP','ENABLE_MOCK_OIDC'].includes(k))) {
    environment({...activation,[key]:undefined},()=>assert.throws(()=>new BffConfigService(),new RegExp(key)));
  }
});
test('authoritative activation refuses unsafe issuer, endpoint, cookie and session settings',()=>{
  for(const bad of [{OIDC_ISSUER_URL:'http://issuer.test.invalid'},{OIDC_REDIRECT_URI:'http://console.test.invalid/callback'},{ADMIN_SERVICE_URL:'http://admin.test.invalid'},
    {OIDC_ISSUER_URL:'https://user:pass@issuer.test.invalid'},{COOKIE_SAME_SITE:'none'},{SESSION_IDLE_TIMEOUT_MS:'NaN'},{SESSION_ABSOLUTE_LIFETIME_MS:'1'},
    {NODE_ENV:'development',ENABLE_MOCK_OIDC:'true'}]) environment({...activation,...bad},()=>assert.throws(()=>new BffConfigService()));
});
test('signed tokens enforce not-before, finite expiry, authorized party, and reject external key hints',()=>{
  const config=new BffConfigService(), service=new OidcService(config,SessionStoreService.forIsolatedTests());
  const now=Math.floor(Date.now()/1000);
  const mint=(claims:Record<string,unknown>,header:Record<string,unknown>={alg:'HS256'})=>{
    const h=Buffer.from(JSON.stringify(header)).toString('base64url');
    const p=Buffer.from(JSON.stringify({iss:config.oidcIssuerUrl,aud:config.oidcClientId,sub:'subject',nonce:'nonce',exp:now+60,...claims})).toString('base64url');
    return `${h}.${p}.${createHmac('sha256',config.oidcClientSecret).update(`${h}.${p}`).digest('base64url')}`;
  };
  assert.equal(service.verifyIdToken(mint({nbf:now-1}),'nonce',config.oidcIssuerUrl,config.oidcClientId).id,'subject');
  for(const claims of [{nbf:now+120},{nbf:'invalid'},{exp:'9999999999'},{aud:[config.oidcClientId,'other']},{iss:'https://wrong.invalid'},{aud:'other'},{nonce:'other'},{exp:now-60}]) {
    assert.throws(()=>service.verifyIdToken(mint(claims),'nonce',config.oidcIssuerUrl,config.oidcClientId));
  }
  for(const alg of ['none','RS256','ES256']) assert.throws(()=>service.verifyIdToken(mint({},{alg,kid:'rotated-key',jku:'https://attacker.invalid/keys'}),'nonce',config.oidcIssuerUrl,config.oidcClientId));
});
test('state expires at callback time even before periodic cleanup and cannot replay',async()=>{
  const service=new OidcService(new BffConfigService(),SessionStoreService.forIsolatedTests()), request=await service.createAuthorizationRequest();
  const original=Date.now;try {Date.now=()=>original()+601000;await assert.rejects(service.handleCallback('code',request.state),/expired/);}
  finally {Date.now=original;}
  await assert.rejects(service.handleCallback('code',request.state),/replayed/);
});
test('missing internal signing key or authoritative flag refuses forwarding before network access',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('network must not run');};
  try {
    for(const values of [{BFF_USE_AUTHORITATIVE_MEMBERSHIP:'false',INTERNAL_JWT_SECRET:'synthetic-internal-key-for-tests-only-32'},{BFF_USE_AUTHORITATIVE_MEMBERSHIP:'true',INTERNAL_JWT_SECRET:undefined}]) {
      let service!:AdminClientService;environment({NODE_ENV:'test',...values},()=>{service=new AdminClientService(new BffConfigService());});
      // Internal key is read at assertion time, so keep this case's environment active.
      const before=process.env['INTERNAL_JWT_SECRET'];
      try {if(values.INTERNAL_JWT_SECRET)process.env['INTERNAL_JWT_SECRET']=values.INTERNAL_JWT_SECRET;else delete process.env['INTERNAL_JWT_SECRET'];await assert.rejects(service.request('subject','tenant','GET'),/not activated/);}
      finally {if(before===undefined)delete process.env['INTERNAL_JWT_SECRET'];else process.env['INTERNAL_JWT_SECRET']=before;}
    }
  } finally {globalThis.fetch=previous;}
});
test('token exchange bounds network calls, refuses redirects and conceals upstream error bodies',async()=>{
  let config!:BffConfigService;environment(activation,()=>{config=new BffConfigService();});
  const provider=new OidcProvider(config), previous=globalThis.fetch;
  try {
    globalThis.fetch=async(url,init)=>{if(String(url).includes('.well-known'))return Response.json({issuer:config.oidcIssuerUrl,authorization_endpoint:'https://issuer.test.invalid/authorize',token_endpoint:'https://issuer.test.invalid/token',jwks_uri:'https://issuer.test.invalid/keys',response_types_supported:['code'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post']});assert.equal(init?.redirect,'error');assert.ok(init?.signal);throw Error('sensitive-upstream-diagnostic');};
    await assert.rejects(provider.exchange('code','verifier'),e=>!String(e).includes('sensitive-upstream')&&String(e).includes('exchange failed'));
    globalThis.fetch=async()=>new Response('sensitive-upstream-body',{status:400});
    await assert.rejects(provider.exchange('code','verifier'),e=>!String(e).includes('sensitive-upstream')&&String(e).includes('exchange failed'));
    globalThis.fetch=async()=>Response.json({access_token:'synthetic'});
    await assert.rejects(provider.exchange('code','verifier'),/exchange failed/);
  } finally {globalThis.fetch=previous;}
});
