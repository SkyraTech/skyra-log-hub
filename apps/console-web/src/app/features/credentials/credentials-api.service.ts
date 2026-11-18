import {Injectable,inject} from '@angular/core';import {HttpClient,HttpParams} from '@angular/common/http';import {AppConfigService} from '../../core/config/app-config.service';import {AuthService} from '../../core/auth/auth.service';
export interface CredentialMetadata {id:string;tenantId:string;projectId:string;createdBy:string|null;issuanceRequestId:string|null;keyPrefix:string;description:string;allowedProjects:string[];allowedEnvironments:string[];rateLimitPerMin:number;createdAt:string;expiresAt:string;updatedAt:string;isRevoked:boolean;revokedAt:string|null;rotatedFromId:string|null;replacementId:string|null;status:'ACTIVE'|'EXPIRED'|'REVOKED';version:string;actions:{revoke:boolean;rotate:boolean};}
export interface IssuedCredential extends CredentialMetadata {rawToken:string;}
export interface CredentialsPage {items:CredentialMetadata[];nextCursor:string|null;canCreate:boolean;project:{id:string;name:string;status:string};}
@Injectable({providedIn:'root'})export class CredentialsApiService {
  private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);
  private url(projectId:string){return this.config.config().adminApiBaseUrl+'/bff/projects/'+encodeURIComponent(projectId)+'/credentials';}
  list(projectId:string,filters:Record<string,string>={}){return this.http.get<CredentialsPage>(this.url(projectId),{withCredentials:true,params:new HttpParams({fromObject:filters})});}
  read(projectId:string,id:string){return this.http.get<CredentialMetadata>(this.url(projectId)+'/'+encodeURIComponent(id),{withCredentials:true});}
  create(projectId:string,body:{description:string;allowedEnvironments:string[];expiresInDays:number},requestId:string){return this.http.post<IssuedCredential>(this.url(projectId),body,{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'Idempotency-Key':requestId}});}
  rotate(projectId:string,id:string,version:string,requestId:string){return this.http.post<IssuedCredential>(this.url(projectId)+'/'+encodeURIComponent(id)+'/rotate',{},{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'If-Match':version,'Idempotency-Key':requestId}});}
  revoke(projectId:string,id:string,version:string){return this.http.post<CredentialMetadata>(this.url(projectId)+'/'+encodeURIComponent(id)+'/revoke',{},{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'If-Match':version}});}
}
