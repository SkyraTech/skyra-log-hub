import {Injectable,inject} from '@angular/core';import {HttpClient,HttpParams} from '@angular/common/http';import {AppConfigService} from '../../core/config/app-config.service';import {AuthService} from '../../core/auth/auth.service';
export interface ProjectView {id:string;tenantId:string;name:string;status:'ACTIVE'|'SUSPENDED'|'ARCHIVED';createdAt:string;updatedAt:string;version:string;actions:{update:boolean;suspend:boolean;reactivate:boolean;archive:boolean};}
export interface ProjectsPage {items:ProjectView[];nextCursor:string|null;canCreate:boolean;}
@Injectable({providedIn:'root'})export class ProjectsApiService {
  private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);
  private get url(){return this.config.config().adminApiBaseUrl+'/bff/projects';}
  list(filters:Record<string,string>={}){return this.http.get<ProjectsPage>(this.url,{withCredentials:true,params:new HttpParams({fromObject:filters})});}
  read(id:string){return this.http.get<ProjectView>(this.url+'/'+encodeURIComponent(id),{withCredentials:true});}
  create(body:{id:string;name:string}){return this.http.post<ProjectView>(this.url,body,{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken()}});}
  update(id:string,body:{name?:string;status?:string},version:string){return this.http.patch<ProjectView>(this.url+'/'+encodeURIComponent(id),body,{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'If-Match':version}});}
}
