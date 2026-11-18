import {SessionStoreService} from '../../src/modules/auth/application/session-store.service.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {startOidcTestProvider} from '../helpers/oidc-test-provider.fixture.js';
import {BffConfigService} from '../../src/config/bff-config.service.js';
import {OidcProvider} from '../../src/modules/auth/application/oidc-provider.js';
import {OidcService} from '../../src/modules/auth/application/oidc.service.js';
const configuration=(values:Record<string,string>)=>{const old={...process.env};try{Object.assign(process.env,values);return new BffConfigService();}finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}};

test('discovery and JWKS verify real signed tokens without mock exchange',{timeout:30000},async t=>{
  const peer=await startOidcTestProvider(),config=configuration(peer.environment),provider=new OidcProvider(config);
  try {
    await t.test('valid RS256 signature resolves issuer/subject and discards provider roles',async()=>{const user=await provider.verify(await peer.mint('nonce'),'nonce');assert.equal(user.id,peer.state.subject);assert.deepEqual(user.roles,[]);assert.equal(peer.state.jwksRequests,1);});
    for(const mode of ['signature','issuer','audience','nonce','expired','future','tenant','azp','none','unknown','jku','missing-exp','missing-iat','future-iat','invalid-nbf'])await t.test(`refuses ${mode}`,async()=>{await assert.rejects(provider.verify(await peer.mint('nonce',undefined,mode),'nonce'),/verification failed/);});
    await t.test('refuses HS256 confusion using public key material',async()=>{const h=Buffer.from(JSON.stringify({alg:'HS256',kid:'first'})).toString('base64url'),p=Buffer.from('{}').toString('base64url');const token=`${h}.${p}.${createHmac('sha256',JSON.stringify(peer.keys[0])).update(`${h}.${p}`).digest('base64url')}`;await assert.rejects(provider.verify(token,'nonce'));});
    await t.test('refuses malformed token and missing signing kid',async()=>{await assert.rejects(provider.verify('malformed','nonce'));const raw=await peer.mint('nonce');const parts=raw.split('.');parts[0]=Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url');await assert.rejects(provider.verify(parts.join('.'),'nonce'));});
    await t.test('unknown kid is bounded by cooldown then a published rotated key succeeds',async()=>{
      const requests=peer.state.jwksRequests;peer.state.publishedKeys=[...peer.keys];peer.state.activeKid='second';
      const rotated=await peer.mint('nonce');await assert.rejects(provider.verify(rotated,'nonce'));assert.equal(peer.state.jwksRequests,requests);
      await new Promise(resolve=>setTimeout(resolve,5100));assert.equal((await provider.verify(rotated,'nonce')).id,peer.state.subject);assert.equal(peer.state.jwksRequests,requests+1);
    });
    await t.test('metadata rejects wrong issuer, untrusted endpoints and unsupported contracts before sending secrets',async()=>{
      const requests=peer.state.tokenRequests;
      for(const override of [{issuer:'https://untrusted.test.invalid'},{token_endpoint:'https://untrusted.test.invalid/token'},{jwks_uri:'https://untrusted.test.invalid/keys'},{id_token_signing_alg_values_supported:['HS256']},{token_endpoint_auth_methods_supported:['none']},{code_challenge_methods_supported:['plain']}]){
        peer.state.metadataOverride=override;await assert.rejects(new OidcProvider(config).metadata(),/discovery/);
      }
      peer.state.metadataOverride={};assert.equal(peer.state.tokenRequests,requests);
    });
    await t.test('malformed discovery and redirect responses fail closed',async()=>{for(const mode of ['invalid','redirect']){peer.state.discoveryMode=mode;await assert.rejects(new OidcProvider(config).metadata(),/discovery/);}peer.state.discoveryMode='valid';});
    await t.test('invalid and unavailable JWKS fail closed',async()=>{for(const mode of ['invalid','unavailable']){peer.state.jwksMode=mode;await assert.rejects(new OidcProvider(config).verify(await peer.mint('nonce'),'nonce'));}peer.state.jwksMode='valid';});
    await t.test('callback requires browser binding and correct PKCE at token endpoint',async()=>{
      const service=new OidcService(config,SessionStoreService.forIsolatedTests()),binding='isolated-browser-binding-at-least-32-characters';peer.state.redirects.add(config.oidcRedirectUri);
      const request=await service.createProviderAuthorizationRequest('/organization',binding);
      const response=await fetch(request.authorizationUrl,{redirect:'manual'});const callback=new URL(response.headers.get('location')!);
      const exchange=new OidcProvider(config);await assert.rejects(exchange.exchange(callback.searchParams.get('code')!,'wrong-verifier'),/exchange failed/);
      const second=await service.createProviderAuthorizationRequest('/organization',binding);
      const authorized=await fetch(second.authorizationUrl,{redirect:'manual'});const received=new URL(authorized.headers.get('location')!);
      const before=peer.state.tokenRequests;await assert.rejects(service.handleCallback(received.searchParams.get('code')!,second.state,undefined,undefined,'other-browser'),/binding/);assert.equal(peer.state.tokenRequests,before);
      await assert.rejects(service.handleCallback(received.searchParams.get('code')!,second.state,undefined,undefined,binding),/replayed/);
    });
    await t.test('real callback exchanges code once, validates JWKS and never uses legacy symmetric helper',async()=>{
      const service=new OidcService(config,SessionStoreService.forIsolatedTests()),binding='isolated-browser-binding-at-least-32-characters';const request=await service.createProviderAuthorizationRequest('/organization',binding);
      const response=await fetch(request.authorizationUrl,{redirect:'manual'});const callback=new URL(response.headers.get('location')!);
      const result=await service.handleCallback(callback.searchParams.get('code')!,request.state,undefined,undefined,binding);assert.equal(result.tokens.user.id,peer.state.subject);
      assert.throws(()=>service.verifyIdToken('anything','nonce',peer.issuer,peer.clientId),/Synthetic/);
      await assert.rejects(service.handleCallback(callback.searchParams.get('code')!,request.state,undefined,undefined,binding));
    });
    await t.test('closed provider produces sanitized bounded discovery failure',async()=>{const other=await startOidcTestProvider();const unavailable=new OidcProvider(configuration(other.environment));await other.close();await assert.rejects(unavailable.metadata(),/discovery is unavailable or invalid/);});
  }finally{await peer.close();}
});
