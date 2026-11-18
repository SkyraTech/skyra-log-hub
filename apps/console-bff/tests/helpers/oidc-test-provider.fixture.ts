import http from 'node:http';
import crypto from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

/** Controlled protocol peer, never installed in production or used as an authentication bypass. */
export async function startOidcTestProvider() {
  const first=await generateKeyPair('RS256'), second=await generateKeyPair('RS256');
  const publicKey=async(key:typeof first,kid:string)=>({...await exportJWK(key.publicKey),kid,alg:'RS256',use:'sig'});
  const keys=[await publicKey(first,'first'),await publicKey(second,'second')];
  const clientId='isolated-entra-protocol-client',clientSecret=crypto.randomBytes(40).toString('hex');
  const tenantId='11111111-2222-4333-8444-555555555555';
  const state={subject:'isolated-owner',mode:'valid',activeKid:'first',publishedKeys:[keys[0]!],metadataOverride:{} as Record<string,unknown>,jwksMode:'valid',discoveryMode:'valid',tokenMode:'valid',jwksRequests:0,tokenRequests:0,discoveryRequests:0,redirects:new Set<string>()};
  const codes=new Map<string,{nonce:string;challenge:string;redirect:string;subject:string;mode:string}>();
  let origin='',issuer='';
  const mint=async(nonce:string,subject=state.subject,mode=state.mode)=>{
    const now=Math.floor(Date.now()/1000);
    const claims:Record<string,unknown>={iss:issuer,aud:clientId,sub:subject,nonce,tid:tenantId,email:'synthetic@test.invalid',name:'Protocol Fixture',roles:['OrgOwner'],iat:now,exp:now+120};
    if(mode==='issuer')claims.iss='https://wrong.test.invalid';if(mode==='audience')claims.aud='wrong-client';if(mode==='nonce')claims.nonce='wrong-nonce';if(mode==='expired')claims.exp=now-60;if(mode==='future')claims.nbf=now+120;if(mode==='tenant')claims.tid='wrong-tenant';if(mode==='azp'){claims.aud=[clientId,'other'];claims.azp='wrong-client';}
    if(mode==='missing-exp')delete claims.exp;if(mode==='missing-iat')delete claims.iat;if(mode==='future-iat')claims.iat=now+120;if(mode==='invalid-nbf')claims.nbf='not-numeric';
    const kid=mode==='unknown'?'unknown':state.activeKid;
    const key=state.activeKid==='second'?second:first;
    let signed=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid,...(mode==='jku'?{jku:'https://attacker.test.invalid/keys'}:{})}).sign(mode==='signature'?second.privateKey:key.privateKey);
    if(mode==='none')signed=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.';
    return signed;
  };
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url!,origin);
      const json=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
      if(url.pathname.endsWith('/.well-known/openid-configuration')){
        state.discoveryRequests++;if(state.discoveryMode==='invalid'){json({issuer:'wrong'});return;}if(state.discoveryMode==='redirect'){res.writeHead(302,{Location:'https://untrusted.test.invalid'});res.end();return;}
        json({issuer,authorization_endpoint:origin+'/oauth2/v2.0/authorize',token_endpoint:origin+'/oauth2/v2.0/token',jwks_uri:origin+'/discovery/v2.0/keys',end_session_endpoint:origin+'/oauth2/v2.0/logout',id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],response_types_supported:['code'],code_challenge_methods_supported:['S256'],...state.metadataOverride});return;
      }
      if(url.pathname==='/discovery/v2.0/keys'){state.jwksRequests++;if(state.jwksMode==='unavailable'){json({error:'unavailable'},503);return;}json(state.jwksMode==='invalid'?{keys:'invalid'}:{keys:state.publishedKeys});return;}
      if(url.pathname==='/oauth2/v2.0/authorize'){
        const redirect=url.searchParams.get('redirect_uri')||'';
        if(url.searchParams.get('client_id')!==clientId||!state.redirects.has(redirect)||url.searchParams.get('response_type')!=='code'||url.searchParams.get('code_challenge_method')!=='S256'){json({error:'invalid_authorization'},400);return;}
        const code=crypto.randomUUID();codes.set(code,{nonce:url.searchParams.get('nonce')!,challenge:url.searchParams.get('code_challenge')!,redirect,subject:state.subject,mode:state.mode});
        const callback=new URL(redirect);callback.searchParams.set('code',code);callback.searchParams.set('state',url.searchParams.get('state')!);res.writeHead(302,{Location:callback.href});res.end();return;
      }
      if(url.pathname==='/oauth2/v2.0/token'){
        state.tokenRequests++;if(state.tokenMode==='unavailable'){json({error:'synthetic-sensitive-body'},503);return;}
        let body='';for await(const chunk of req){body+=String(chunk);if(body.length>8192)throw Error('Request too large');}
        const p=new URLSearchParams(body),code=p.get('code')||'',record=codes.get(code);codes.delete(code);
        if(!record||p.get('client_id')!==clientId||p.get('client_secret')!==clientSecret||p.get('redirect_uri')!==record.redirect||p.get('grant_type')!=='authorization_code'||crypto.createHash('sha256').update(p.get('code_verifier')||'').digest('base64url')!==record.challenge){json({error:'invalid_grant'},400);return;}
        json({id_token:await mint(record.nonce,record.subject,record.mode),access_token:'synthetic-access-token',token_type:'Bearer'});return;
      }
      if(url.pathname==='/oauth2/v2.0/logout'){const destination=url.searchParams.get('post_logout_redirect_uri');if(destination&&state.redirects.has(destination)){res.writeHead(302,{Location:destination});res.end();}else json({signedOut:true});return;}
      json({error:'not_found'},404);
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;issuer=origin+'/tenant/v2.0';
  return {origin,issuer,clientId,clientSecret,tenantId,state,keys,mint,
    environment:{NODE_ENV:'test',SKYRA_ISOLATED_TEST_ENV:'true',OIDC_ALLOW_LOOPBACK_TEST:'true',ENABLE_MOCK_OIDC:'false',OIDC_ISSUER_URL:issuer,OIDC_CLIENT_ID:clientId,OIDC_CLIENT_SECRET:clientSecret,OIDC_TENANT_ID:tenantId,OIDC_DISCOVERY_URL:issuer+'/.well-known/openid-configuration',OIDC_TRUSTED_ENDPOINT_ORIGINS:origin,OIDC_REDIRECT_URI:origin+'/callback'},
    close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
