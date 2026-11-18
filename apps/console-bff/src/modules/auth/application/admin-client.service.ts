import { Injectable, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { BffConfigService } from '../../../config/bff-config.service.js';

@Injectable()
export class AdminClientService {
  constructor(private readonly config: BffConfigService) {}
  private assertion(subject: string, tenantId: string, scope: string) {
    const secret = process.env['INTERNAL_JWT_SECRET'];
    if (!this.config.useAuthoritativeMembership || !secret || secret.length < 32 ||
        (this.config.mockOidcEnabled && this.config.nodeEnv !== 'test')) {
      throw new ServiceUnavailableException('Authoritative organization access is not activated.');
    }
    const now = Math.floor(Date.now()/1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: process.env['INTERNAL_JWT_ISSUER'] ?? 'https://auth.skyra.internal',
      aud: process.env['INTERNAL_JWT_AUDIENCE'] ?? 'skyra-admin-service', sub: subject,
      identity_issuer: this.config.oidcIssuerUrl, tenant_id: tenantId, scope, iat: now, nbf: now-2, exp: now+60 })).toString('base64url');
    const signature = createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }
  async request(subject: string, tenantId: string, method: 'GET'|'PATCH', body?: unknown, etag?: string, correlationId: string = randomUUID()) {
    const scope = tenantId ? 'organization' : 'memberships.resolve';
    const path = tenantId ? `tenants/${encodeURIComponent(tenantId)}` : 'me/memberships';
    return this.forward(subject,tenantId,scope,path,method,body,etag,correlationId);
  }
  requestMembers(subject:string,tenantId:string,method:'GET'|'PATCH',id?:string,query='',body?:unknown,etag?:string,correlationId:string=randomUUID()){
    if(id&&!/^[0-9a-f-]{36}$/i.test(id))throw new HttpException('Membership not found.',404);
    const path=`tenants/${encodeURIComponent(tenantId)}/memberships${id?'/'+encodeURIComponent(id):''}${query?'?'+query:''}`;
    return this.forward(subject,tenantId,method==='GET'?'members.read':'members.manage',path,method,body,etag,correlationId);
  }
  requestProjects(subject:string,tenantId:string,method:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',id?:string,query='',body?:unknown,etag?:string,correlationId:string=randomUUID()) {
    if(id&&(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)))throw new HttpException('Project not found.',404);
    const path=`tenants/${encodeURIComponent(tenantId)}/projects${id?'/'+encodeURIComponent(id):''}${query?'?'+query:''}`;
    return this.forward(subject,tenantId,method==='GET'?'projects.read':'projects.manage',path,method,body,etag,correlationId);
  }
  requestAudit(subject:string,tenantId:string,query='',eventId?:string,access=false,signal?:AbortSignal){
    if(eventId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(eventId))throw new HttpException('Audit event not found.',404);
    const path=`tenants/${encodeURIComponent(tenantId)}/audit-events${access?'/access':eventId?'/'+encodeURIComponent(eventId):''}${query?'?'+query:''}`;
    return this.forward(subject,tenantId,'audit.read',path,'GET',undefined,undefined,randomUUID(),undefined,signal);
  }
  requestUsageHistory(subject:string,tenant:string,project:string,query:string){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(project))throw new HttpException('Project not found.',404);
    return this.forward(subject,tenant,'quotas.read',`tenants/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(project)}/usage/history?${query}`,'GET',undefined,undefined,randomUUID());
  }
  requestQuota(subject:string,tenantId:string,projectId:string,resource:'usage'|'quota',method:'GET'|'PATCH',period?:string,body?:unknown,etag?:string){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId))throw new HttpException('Project not found.',404);
    const path=`tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/${resource}${period?'?period='+encodeURIComponent(period):''}`;
    return this.forward(subject,tenantId,method==='PATCH'?'quotas.manage':'quotas.read',path,method,body,etag,randomUUID());
  }
  requestCredentials(subject:string,tenantId:string,projectId:string,operation:'read'|'create'|'rotate'|'revoke',id?:string,query='',body?:unknown,etag?:string,requestId?:string,correlationId:string=randomUUID()){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)||id&&!/^[a-f0-9-]{36}$/i.test(id))throw new HttpException('Credential not found.',404);
    if(requestId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw new HttpException('Invalid issuance request identifier.',400);
    const path=`tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/credentials${id?'/'+encodeURIComponent(id):''}${operation==='rotate'||operation==='revoke'?'/'+operation:''}${query?'?'+query:''}`;
    return this.forward(subject,tenantId,'credentials.'+operation,path,operation==='read'?'GET':'POST',body,etag,correlationId,requestId);
  }
  requestDashboardPreferences(subject:string,tenant:string,project:string,method:'GET'|'PUT'|'POST',body?:unknown,etag?:string){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(project))throw new HttpException('Dashboard project not found.',404);
    return this.forward(subject,tenant,'analytics.preferences',`tenants/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(project)}/dashboard-preferences${method==='POST'?'/reset':''}`,method,body,etag,randomUUID());
  }
  requestSavedSearch(subject:string,tenant:string,project:string,method:'GET'|'POST'|'PUT'|'DELETE',id?:string,query='',body?:unknown,etag?:string){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(project)||id&&!/^[a-f0-9-]{36}$/i.test(id))throw new HttpException('Saved search not found.',404);
    return this.forward(subject,tenant,'saved-searches',`tenants/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(project)}/saved-searches${id?'/'+encodeURIComponent(id):''}${query?'?'+query:''}`,method,body,etag,randomUUID());
  }
  private async forward(subject:string,tenantId:string,scope:string,path:string,method:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',body:unknown,etag:string|undefined,correlationId:string,requestId?:string,signal?:AbortSignal){
    const token = this.assertion(subject, tenantId, scope);
    const url = `${this.config.adminServiceUrl.replace(/\/$/,'')}/admin/v1/${path}`;
    let response: Response;
    try {
      response = await fetch(url, { method, redirect: 'error', signal: signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId,
          ...(etag ? { 'If-Match': etag } : {}),...(requestId?{'Idempotency-Key':requestId}:{}) }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
    } catch (error) {
      throw new HttpException('Administration service unavailable. Retry later.', error instanceof Error && error.name === 'TimeoutError' ? 504 : 502);
    }
    if (!response.ok) {
      const status = [400,401,403,404,409,412,428,503].includes(response.status) ? response.status : 502;
      const detail = scope==='analytics.preferences'?(status===409?'Dashboard preferences changed. Reload before saving.':status===428?'Reload dashboard preferences before saving.':status===400?'Invalid dashboard preferences.':status===403||status===404?'Dashboard preferences access denied.':'Dashboard preferences unavailable.'):scope==='saved-searches'?(status===409?'Saved search changed or name exists. Reload before saving.':status===428?'Reload saved search before changing it.':status===404?'Saved search not found.':status===403?'Saved search mutation denied.':status===400?'Invalid saved search filters.':'Saved search service unavailable.'):scope==='audit.read'?(status===400?'Invalid or expired audit filters/cursor. Reload the first page.':status===403?'Audit history access denied.':status===404?'Audit event not found.':'Audit history is unavailable. Retry later.') : scope.startsWith('quotas.')?(status===409?'Quota changed. Reload before saving.':status===428?'Reload the quota policy before saving.':status===403||status===404?'Usage access denied.':status===400?'Invalid quota request.':'Usage service unavailable.') : scope.startsWith('credentials.')?(status===409?'Credential changed or issuance was already processed. Secrets cannot be recovered; review metadata before retrying.':status===428?'Reload credential metadata before changing it.':status===403||status===404?'Credential access denied.':status===400?'Invalid credential fields or request identifier.':'Credential service unavailable. Review metadata before retrying issuance.') : scope.startsWith('projects.')?(status===409||status===412?'Project conflict. Reload or choose another identifier.':status===428?'If-Match is required. Reload the project before saving.':status===403||status===404?'Project access denied.':status===400?'Invalid project request.':'Project service unavailable.') : scope.startsWith('members.')?(status===409||status===412?'Membership changed or the transition is not permitted. Reload before retrying.':status===428?'Reload the member before saving; If-Match is required.':status===403||status===404?'Member access denied.':status===400?'Invalid member request.':'Member service unavailable.') : status === 409 || status === 412 ? 'Organization changed. Reload before retrying.' :
        status === 428 ? 'Reload the organization before saving; If-Match is required.' :
        status === 403 || status === 404 ? 'Organization access denied.' : status === 400 ? 'Invalid organization update.' : 'Administration request failed.';
      throw new HttpException(detail, status);
    }
    try { const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(reader){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576)throw Error('Response bound');chunks.push(part.value);}}finally{await reader?.cancel().catch(()=>{});}
      return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, etag: response.headers.get('etag'),
      capabilities: (response.headers.get('x-organization-capabilities') ?? '').split(',').filter(c => ['tenant.read','tenant.update'].includes(c)) }; }
    catch { throw new HttpException('Invalid administration response.', 502); }
  }
}
