import {Injectable,inject} from '@angular/core';import {HttpClient} from '@angular/common/http';import {AppConfigService} from '../../../core/config/app-config.service';import {AuthService} from '../../../core/auth/auth.service';
export interface DashboardSettings {v:number;range:string;refreshSeconds:number;service:string;interval:string;topN:number;metric:string;}
export interface DashboardPreference {projectId:string;settings:DashboardSettings;version:string;persisted:boolean;updatedAt:string|null;}
@Injectable({providedIn:'root'})
export class DashboardApi {
 private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);
 private path(project:string){return this.config.config().adminApiBaseUrl+'/bff/projects/'+encodeURIComponent(project)+'/dashboard-preferences';}
 private options(version?:string){return {withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),...(version?{'If-Match':version}:{})}};}
 query(body:unknown){return this.http.post<any>(this.config.config().adminApiBaseUrl+'/bff/query/dashboard',body,this.options());}
 read(project:string){return this.http.get<DashboardPreference>(this.path(project),this.options());}
 save(project:string,settings:DashboardSettings,version:string){return this.http.put<DashboardPreference>(this.path(project),settings,this.options(version));}
 reset(project:string,version:string){return this.http.post<DashboardPreference>(this.path(project)+'/reset',{},this.options(version));}
}
