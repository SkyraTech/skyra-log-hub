import {Injectable,inject} from '@angular/core';
import {HttpClient,HttpParams} from '@angular/common/http';
import {AppConfigService} from '../../core/config/app-config.service';
import {AuthService} from '../../core/auth/auth.service';
export type MemberRole='OrgOwner'|'OrgAdmin'|'ProjectAdmin'|'Developer'|'Viewer';
export interface MemberView {id:string;displayName:string;email:string;identityStatus:string;status:string;roles:MemberRole[];projectRoles:{role:MemberRole;projectId:string}[];scope:'organization';version:string;self:boolean;lastOwner:boolean;permittedRoles:MemberRole[];actions:{changeRole:boolean;suspend:boolean;reactivate:boolean;revoke:boolean};createdAt:string;updatedAt:string;}
export interface MembersPage {items:MemberView[];nextCursor:string|null;capabilities:string[];roles:{name:MemberRole;description:string;capabilities:string[]}[];}
@Injectable({providedIn:'root'})export class MembersApiService {
  private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);
  private get url(){return this.config.config().adminApiBaseUrl+'/bff/organization/members';}
  list(filters:Record<string,string>={}){return this.http.get<MembersPage>(this.url,{withCredentials:true,params:new HttpParams({fromObject:filters})});}
  read(id:string){return this.http.get<MemberView>(this.url+'/'+encodeURIComponent(id),{withCredentials:true});}
  update(id:string,body:{role?:MemberRole;status?:string},version:string){return this.http.patch<MemberView>(this.url+'/'+encodeURIComponent(id),body,{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'If-Match':version}});}
}
