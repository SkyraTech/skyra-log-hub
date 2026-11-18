import {UsageHistoryComponent} from './usage-history.component';
import {AuditLinkComponent} from '../audit/audit-link.component';
import {Component,ChangeDetectionStrategy,CUSTOM_ELEMENTS_SCHEMA,inject,signal,computed,DestroyRef,HostListener} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HttpClient,HttpErrorResponse} from '@angular/common/http';
import {ActivatedRoute,Router} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Subscription} from 'rxjs';
import {AuthService} from '../../core/auth/auth.service';
import {AppConfigService} from '../../core/config/app-config.service';
interface Metric {accepted:string;reserved:string;limit:string|null;remaining:string|null;utilization:number|null;}
interface Policy {enabled:boolean;dailyEvents:string|null;dailyBytes:string|null;version:string;canManage:boolean;}
interface Usage {projectId:string;projectName:string;period:string;periodStart:string;periodEnd:string;policy:Policy;events:Metric;bytes:Metric;completeness:'COMPLETE'|'RECONCILING';updatedAt:string|null;measuredAt:string;byteDefinition:string;}
@Component({selector:'skyra-usage',standalone:true,imports:[CommonModule,AuditLinkComponent,UsageHistoryComponent],schemas:[CUSTOM_ELEMENTS_SCHEMA],templateUrl:'./usage.component.html',styleUrl:'./usage.component.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class UsageComponent {
  private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);private pending?:Subscription;
  private projectId='';private period='';
  readonly advanced=computed(()=>this.config.config().advancedAuditUsage===true);
  readonly data=signal<Usage|null>(null);readonly loading=signal(true);readonly busy=signal(false);readonly error=signal('');readonly success=signal('');readonly conflict=signal(false);readonly editing=signal(false);readonly confirming=signal(false);
  readonly events=signal('');readonly bytes=signal('');readonly enabled=signal(true);
  readonly valid=computed(()=>[this.events(),this.bytes()].every(v=>v===''||/^(0|[1-9][0-9]{0,15})$/.test(v)&&BigInt(v)<=9007199254740991n));
  readonly dirty=computed(()=>this.editing()&&!!this.data()&&(this.events()!==(this.data()!.policy.dailyEvents??'')||this.bytes()!==(this.data()!.policy.dailyBytes??'')||this.enabled()!==this.data()!.policy.enabled));
  readonly cards=computed(()=>{const d=this.data();return d?[{name:'Events',metric:d.events},{name:'Canonical ingestion bytes',metric:d.bytes}]:[];});
  private get url(){return this.config.config().adminApiBaseUrl+'/bff/projects/'+encodeURIComponent(this.projectId);}
  constructor(){this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(p=>{this.projectId=p.get('projectId')!;this.period=this.route.snapshot.queryParamMap.get('period')??'';this.data.set(null);this.editing.set(false);this.load();});}
  load(){this.pending?.unsubscribe();this.loading.set(true);this.error.set('');this.conflict.set(false);this.confirming.set(false);
    this.pending=this.http.get<Usage>(this.url+'/usage',{withCredentials:true,...(this.period?{params:{period:this.period}}:{})}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:d=>{this.data.set(d);this.reset();this.loading.set(false);},error:e=>this.handle(e)});
  }
  private reset(){const p=this.data()?.policy;this.events.set(p?.dailyEvents??'');this.bytes.set(p?.dailyBytes??'');this.enabled.set(p?.enabled??true);this.editing.set(false);this.confirming.set(false);}
  edit(){if(this.data()?.policy.canManage)this.editing.set(true);}cancel(){this.reset();this.error.set('');}
  requestSave(){if(this.valid()&&this.dirty()&&!this.conflict()&&!this.busy())this.confirming.set(true);}
  save(){const d=this.data();if(!d||!d.policy.canManage||!this.confirming()||!this.valid()||this.busy()||this.conflict())return;
    this.busy.set(true);this.error.set('');this.success.set('');this.confirming.set(false);
    this.http.patch<Policy>(this.url+'/quota',{enabled:this.enabled(),dailyEvents:this.events()||null,dailyBytes:this.bytes()||null},{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken(),'If-Match':d.policy.version}}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.busy.set(false);this.success.set('Quota policy saved. Accepted usage is preserved.');this.load();},error:e=>{this.busy.set(false);this.handle(e);}});
  }
  reload(){if(!this.dirty()||window.confirm('Discard unsaved quota changes?'))this.load();}
  back(){void this.router.navigate(['/projects',this.projectId]);}
  canLeave(){return !this.busy()&&(!this.dirty()||window.confirm('Discard unsaved quota changes?'));}
  @HostListener('window:beforeunload',['$event'])unload(e:BeforeUnloadEvent){if(this.dirty()||this.busy()){e.preventDefault();e.returnValue='';}}
  private handle(e:HttpErrorResponse){this.loading.set(false);this.conflict.set([409,412,428].includes(e.status));if(e.status===401){this.data.set(null);this.auth.logout();void this.router.navigateByUrl('/login');return;}
    if([403,404].includes(e.status)){this.data.set(null);this.editing.set(false);}
    this.error.set(this.conflict()?'Quota changed. Reload before saving.':[403,404].includes(e.status)?'You do not have permission to view usage for this project.':e.status===400?'Invalid quota fields or UTC period.':'Usage is unavailable. Displayed counters may be stale. Retry to load authoritative counters.');}
}
