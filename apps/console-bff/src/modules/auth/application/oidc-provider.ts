import { createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify } from 'jose';
import type { BffConfigService } from '../../../config/bff-config.service.js';
import { OidcCallbackException } from '../../../common/errors/bff.errors.js';
import type { UserProfile } from '../domain/session.model.js';

type Metadata = { issuer:string; authorization_endpoint:string; token_endpoint:string; jwks_uri:string; end_session_endpoint?:string };

/** Fixed operator trust roots; no token-supplied URL or cross-origin redirect is trusted. */
export class OidcProvider {
  private cached?: { metadata:Metadata; expires:number; keys:ReturnType<typeof createRemoteJWKSet> };
  private loading?:Promise<Metadata>;
  constructor(private readonly config:BffConfigService) {}

  private trusted(value:string):URL {
    const url=new URL(value);
    const local=this.config.oidcLoopbackTest && url.protocol==='http:' && url.hostname==='127.0.0.1';
    if ((!local && url.protocol!=='https:') || url.username || url.password || url.hash ||
        !this.config.oidcTrustedOrigins.includes(url.origin)) throw Error('Untrusted OIDC endpoint');
    return url;
  }
  private async text(response:Response,max=262144):Promise<string> {
    if(!response.ok || !response.body)throw Error('OIDC endpoint unavailable');
    const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
    try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('OIDC response too large');chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});}
    return Buffer.concat(chunks).toString('utf8');
  }
  async metadata():Promise<Metadata> {
    if(this.cached && Date.now()<this.cached.expires)return this.cached.metadata;
    if(this.loading)return this.loading;
    this.loading=this.load();try{return await this.loading;}finally{this.loading=undefined;}
  }
  private async load():Promise<Metadata> {
    try {
      if(!this.config.oidcDiscoveryUrl || !this.config.oidcTrustedOrigins.length)throw Error('Missing OIDC trust configuration');
      this.trusted(this.config.oidcIssuerUrl);
      const discovery=this.trusted(this.config.oidcDiscoveryUrl);
      if(discovery.search)throw Error('Discovery query not allowed');
      const res=await fetch(discovery,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});
      const raw:unknown=JSON.parse(await this.text(res,65536));
      if(!raw || typeof raw!=='object' || Array.isArray(raw))throw Error('Invalid metadata');
      const data=raw as Record<string,unknown>;
      if(data['issuer']!==this.config.oidcIssuerUrl || !Array.isArray(data['id_token_signing_alg_values_supported']) ||
          !data['id_token_signing_alg_values_supported'].includes('RS256') ||
          !Array.isArray(data['response_types_supported']) || !data['response_types_supported'].includes('code') ||
          !Array.isArray(data['token_endpoint_auth_methods_supported']) || !data['token_endpoint_auth_methods_supported'].includes('client_secret_post'))throw Error('Unsupported metadata contract');
      if(data['code_challenge_methods_supported']!==undefined && (!Array.isArray(data['code_challenge_methods_supported']) || !data['code_challenge_methods_supported'].includes('S256')))throw Error('S256 unsupported');
      for(const key of ['authorization_endpoint','token_endpoint','jwks_uri']) {
        if(typeof data[key]!=='string')throw Error('Missing endpoint');this.trusted(data[key]);
      }
      if(data['end_session_endpoint']!==undefined){if(typeof data['end_session_endpoint']!=='string')throw Error('Invalid logout endpoint');this.trusted(data['end_session_endpoint']);}
      const metadata=data as unknown as Metadata;
      // Retain a resolver on same-URI metadata refresh, preserving cooldown and key cache.
      const keys=this.cached?.metadata.jwks_uri===metadata.jwks_uri?this.cached.keys:createRemoteJWKSet(new URL(metadata.jwks_uri),{
        timeoutDuration:5000,cacheMaxAge:600000,cooldownDuration:5000,
        [customFetch]:async(url,options)=>{
          if(url!==metadata.jwks_uri)throw Error('Unexpected key endpoint');this.trusted(url);
          const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.any([options.signal,AbortSignal.timeout(5000)])});
          return new Response(await this.text(response),{status:200,headers:{'Content-Type':'application/json'}});
        }
      });
      this.cached={metadata,keys,expires:Date.now()+600000};return metadata;
    }catch{throw new OidcCallbackException('OIDC discovery is unavailable or invalid.');}
  }
  async exchange(code:string,verifier:string):Promise<{id_token:string;access_token:string;refresh_token?:string}> {
    const metadata=await this.metadata();
    try {
      if(this.config.oidcClientSecret.length<32)throw Error('Missing confidential credential');
      const body=new URLSearchParams({grant_type:'authorization_code',client_id:this.config.oidcClientId,
        client_secret:this.config.oidcClientSecret,code,redirect_uri:this.config.oidcRedirectUri,code_verifier:verifier});
      const response=await fetch(this.trusted(metadata.token_endpoint),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
        headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:body.toString()});
      const raw:unknown=JSON.parse(await this.text(response));
      if(!raw || typeof raw!=='object')throw Error('Invalid token response');
      const value=raw as Record<string,unknown>;
      if(typeof value['id_token']!=='string' || typeof value['access_token']!=='string' || (value['refresh_token']!==undefined && typeof value['refresh_token']!=='string'))throw Error('Invalid token response');
      return value as {id_token:string;access_token:string;refresh_token?:string};
    }catch{throw new OidcCallbackException('OIDC token exchange failed.');}
  }
  async verify(token:string,nonce:string):Promise<UserProfile> {
    try {
      if(token.length>65536 || !nonce)throw Error('Invalid token');
      const header=decodeProtectedHeader(token);
      if(header.alg!=='RS256' || typeof header.kid!=='string' || !header.kid || header.kid.length>256 || header.jku || header.jwk || header.x5u)throw Error('Invalid signing header');
      await this.metadata();
      const {payload}=await jwtVerify(token,this.cached!.keys,{issuer:this.config.oidcIssuerUrl,audience:this.config.oidcClientId,
        algorithms:['RS256'],clockTolerance:10,requiredClaims:['iss','aud','sub','exp','iat','nonce']});
      if(payload.nonce!==nonce || typeof payload.sub!=='string' || !payload.sub || payload.sub.length>255 ||
          (Array.isArray(payload.aud) && payload.aud.length>1 && payload.azp!==this.config.oidcClientId) ||
          (payload.azp!==undefined && payload.azp!==this.config.oidcClientId) || typeof payload.iat!=='number' || payload.iat>Math.floor(Date.now()/1000)+10)throw Error('Invalid claims');
      if(this.config.oidcTenantId && payload.tid!==this.config.oidcTenantId)throw Error('External tenant mismatch');
      // iss+sub is the existing unique identity. Email and provider roles never grant access.
      const email=typeof payload.email==='string'?payload.email:'';
      return {id:payload.sub,email,name:typeof payload.name==='string'?payload.name:email||payload.sub,roles:[]};
    }catch{throw new OidcCallbackException('ID token verification failed.');}
  }
}
