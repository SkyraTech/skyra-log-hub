import {Component,ChangeDetectionStrategy,CUSTOM_ELEMENTS_SCHEMA,inject,signal,DestroyRef,effect,untracked} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Subscription} from 'rxjs';
import {ProjectsApiService,ProjectView} from '../projects/projects-api.service';
import {CredentialsApiService} from '../credentials/credentials-api.service';
import {AuthService} from '../../core/auth/auth.service';
import {WorkspaceContextService} from '../../core/workspace/workspace-context.service';

@Component({selector:'skyra-getting-started',standalone:true,imports:[CommonModule,RouterLink],schemas:[CUSTOM_ELEMENTS_SCHEMA],templateUrl:'./getting-started.component.html',styleUrl:'./getting-started.component.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class GettingStartedComponent {
  private readonly projectsApi=inject(ProjectsApiService);private readonly credentialsApi=inject(CredentialsApiService);
  private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly auth=inject(AuthService);private readonly destroy=inject(DestroyRef);private readonly workspace=inject(WorkspaceContextService);
  private pending?:Subscription;private credentialRequest?:Subscription;
  readonly projects=signal<ProjectView[]>([]);readonly selected=signal<ProjectView|null>(null);readonly loading=signal(true);readonly error=signal('');readonly notice=signal('');readonly canCreate=signal(false);readonly credentialState=signal('Select a project to check credential access.');readonly nextCursor=signal<string|null>(null);
  readonly install='node scripts/package-node-sdk.mjs\n# From your application directory, replace CHECKOUT with the absolute LogHub checkout path:\nnpm install CHECKOUT/.tmp/sdk-packages/skyra-logger-core-1.0.0.tgz CHECKOUT/.tmp/sdk-packages/skyra-logger-node-1.0.0.tgz';
  readonly code=`import {createSkyraLogger, HttpTransport} from '@skyra/logger-node';
const {SKYRA_PROJECT_ID, SKYRA_INGESTION_ENDPOINT, SKYRA_INGESTION_CREDENTIAL} = process.env;
if (!SKYRA_PROJECT_ID || !SKYRA_INGESTION_ENDPOINT || !SKYRA_INGESTION_CREDENTIAL) {
  throw new Error('Missing Skyra environment configuration');
}
const logger = createSkyraLogger({
  projectId: SKYRA_PROJECT_ID, serviceName: 'onboarding-sample',
  environment: 'development', instanceId: 'sample', validationMode: 'strict'
}, new HttpTransport({endpoint: SKYRA_INGESTION_ENDPOINT, credential: SKYRA_INGESTION_CREDENTIAL}));
try {
  logger.info('My first Skyra event', {labels: {example: 'onboarding'}, attributes: {order: {id: 42}}});
  await logger.flush();
  if (logger.getStatus().totalEventsDropped) throw new Error('Events dropped');
  await logger.close();
} catch {
  console.error('Delivery failed; check configuration, credential scope, Gateway and quota.');
  process.exitCode = 1;
}`;
  constructor(){this.destroy.onDestroy(()=>{this.pending?.unsubscribe();this.credentialRequest?.unsubscribe();});let scope='';effect(()=>{const user=this.auth.currentUser(),next=(this.auth.isAuthenticated()?user?.id:'')+'/'+this.workspace.activeTenant()?.id;if(next!==scope){scope=next;untracked(()=>this.load());}});}
  load(more=false){this.pending?.unsubscribe();this.loading.set(true);this.error.set('');if(!more){this.projects.set([]);this.selected.set(null);this.nextCursor.set(null);this.canCreate.set(false);this.credentialRequest?.unsubscribe();}
    this.pending=this.projectsApi.list({limit:'100',status:'ACTIVE',...(more&&this.nextCursor()?{cursor:this.nextCursor()!}:{})}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:page=>{this.projects.update(p=>[...p,...page.items]);this.nextCursor.set(page.nextCursor);this.loading.set(false);if(!more){const requested=this.route.snapshot.queryParamMap.get('project');const p=requested?this.projects().find(p=>p.id===requested):this.projects()[0];if(p)this.select(p.id);else if(requested)this.error.set('Requested project is not in the loaded authorized projects. Load more projects or select an accessible project.');}},error:e=>{this.loading.set(false);if(e.status===401){this.auth.logout();void this.router.navigateByUrl('/login');}else this.error.set([403,404].includes(e.status)?'You do not have permission to access projects.':'Project service unavailable. Retry to load authorized projects.');}});
  }
  select(id:string){this.credentialRequest?.unsubscribe();this.selected.set(this.projects().find(p=>p.id===id)??null);this.canCreate.set(false);this.notice.set('');const p=this.selected();if(!p)return;
    this.credentialState.set('Checking credential permissions...');
    this.credentialRequest=this.credentialsApi.list(p.id,{limit:'1'}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:page=>{this.canCreate.set(page.canCreate);this.credentialState.set(page.canCreate?'You may create a credential using the existing secure one-time handoff.':'Ask a project administrator or organization administrator to provision a credential. Your current access does not allow creation.');},error:e=>{if(e.status===401){this.selected.set(null);this.auth.logout();void this.router.navigateByUrl('/login');}else this.credentialState.set([403,404].includes(e.status)?'Credential management is not available to your current permissions. Ask an authorized administrator.':'Credential service unavailable. Retry by selecting the project again.');}});
  }
  async copy(value:string,label:string){try{await navigator.clipboard.writeText(value);this.notice.set(label+' copied.');}catch{this.notice.set('Clipboard unavailable. Select and copy the displayed text manually.');}}
}
