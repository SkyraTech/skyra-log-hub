import {Injectable,inject,signal,computed,effect} from '@angular/core';import {HttpClient} from '@angular/common/http';
import {AuthService} from '../../core/auth/auth.service';import {AppConfigService} from '../../core/config/app-config.service';import {WorkspaceContextService} from '../../core/workspace/workspace-context.service';
@Injectable({providedIn:'root'})
export class AuditNavigationService {
  private readonly auth=inject(AuthService);private readonly workspace=inject(WorkspaceContextService);private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);
  private readonly grant=signal('');readonly actions=signal<{value:string;label:string}[]>([]);
  private readonly context=computed(()=>{const user=this.auth.currentUser();return user&&this.auth.isAuthenticated()&&!this.auth.isPreviewSession()?{tenant:this.workspace.activeTenant()?.id??user.tenantId,user:user.id}:null;});
  readonly canRead=computed(()=>{const c=this.context();return !!c&&this.grant()===c.tenant+'/'+c.user;});
  constructor(){effect(onCleanup=>{const c=this.context();this.grant.set('');this.actions.set([]);if(!c?.tenant)return;
    const sub=this.http.get<{canRead:boolean;tenantId:string;actions:{value:string;label:string}[]}>(this.config.config().adminApiBaseUrl+'/bff/organization/audit/access',{withCredentials:true}).subscribe({next:d=>{if(d.canRead&&d.tenantId===c.tenant){this.grant.set(c.tenant+'/'+c.user);this.actions.set(d.actions);}},error:()=>{this.grant.set('');}});onCleanup(()=>sub.unsubscribe());
  });}
}
