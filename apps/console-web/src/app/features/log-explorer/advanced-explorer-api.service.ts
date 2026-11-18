import {Injectable,inject} from '@angular/core';import {HttpClient,HttpParams} from '@angular/common/http';import {AppConfigService} from '../../core/config/app-config.service';import {AuthService} from '../../core/auth/auth.service';import {SearchLogsRequest} from '../../core/http/api-client.port';
export interface SavedFilters {v:1;range:{kind:'relative';preset:'15m'|'1h'|'6h'|'24h'|'7d'}|{kind:'absolute';start:string;end:string};queryText?:string;levels?:string[];services?:string[];environments?:string[];traceId?:string;correlationId?:string;}
export interface SavedSearch {id:string;projectId:string;name:string;description:string;visibility:'PRIVATE'|'PROJECT';filters:SavedFilters;version:string;owned:boolean;canEdit:boolean;createdAt:string;updatedAt:string;}
@Injectable({providedIn:'root'})export class AdvancedExplorerApi {
 private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);
 private get base(){return this.config.config().adminApiBaseUrl;}
 private path(project:string,id?:string){return this.base+'/bff/projects/'+encodeURIComponent(project)+'/saved-searches'+(id?'/'+encodeURIComponent(id):'');}
 private get headers(){return {'X-CSRF-Token':this.auth.csrfToken()};}
 list(project:string,after?:string){return this.http.get<{items:SavedSearch[];nextCursor:string|null;canShare:boolean}>(this.path(project),{withCredentials:true,params:new HttpParams({fromObject:{limit:'20',...(after?{after}:{})}})});}
 read(project:string,id:string){return this.http.get<SavedSearch>(this.path(project,id),{withCredentials:true});}
 save(project:string,input:{name:string;description:string;visibility:'PRIVATE'|'PROJECT';filters:SavedFilters},existing?:SavedSearch){return existing?this.http.put<SavedSearch>(this.path(project,existing.id),input,{withCredentials:true,headers:{...this.headers,'If-Match':existing.version}}):this.http.post<SavedSearch>(this.path(project),input,{withCredentials:true,headers:this.headers});}
 remove(project:string,existing:SavedSearch){return this.http.delete<{deleted:boolean}>(this.path(project,existing.id),{withCredentials:true,headers:{...this.headers,'If-Match':existing.version}});}
 export(search:SearchLogsRequest,format:'json'|'csv',scope:'page'|'matching',eventIds?:string[]){return this.http.post(this.base+'/bff/query/export',{search,format,scope,...(eventIds?{eventIds}:{})},{withCredentials:true,headers:this.headers,responseType:'blob',observe:'response'});}
}
