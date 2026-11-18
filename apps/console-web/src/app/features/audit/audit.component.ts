import {Component,ChangeDetectionStrategy,CUSTOM_ELEMENTS_SCHEMA,inject,signal,computed,DestroyRef,ViewChild,ElementRef,AfterViewInit} from '@angular/core';import {CommonModule} from '@angular/common';import {HttpClient,HttpErrorResponse,HttpParams} from '@angular/common/http';import {ActivatedRoute,Router} from '@angular/router';import {takeUntilDestroyed} from '@angular/core/rxjs-interop';import {Subscription} from 'rxjs';
import {AuthService} from '../../core/auth/auth.service';import {AppConfigService} from '../../core/config/app-config.service';import {AuditNavigationService} from './audit-navigation.service';
export interface AuditEvent {id:string;timestamp:string;action:string;actionLabel:string;actorId:string|null;actorLabel:string;resourceType:string;resourceId:string;summary:string;correlationId:string|null;metadataOmitted:boolean;changes:{field:string;label:string;before:string|boolean|null;after:string|boolean|null;beforeAvailable:boolean;afterAvailable:boolean}[];}
interface AuditPage {items:AuditEvent[];nextCursor:string|null;pageSize:number;order:string;}
@Component({selector:'skyra-audit-history',standalone:true,imports:[CommonModule],schemas:[CUSTOM_ELEMENTS_SCHEMA],templateUrl:'./audit.component.html',styleUrl:'./audit.component.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class AuditComponent implements AfterViewInit {
  private readonly http=inject(HttpClient);private readonly config=inject(AppConfigService);private readonly auth=inject(AuthService);private readonly router=inject(Router);private readonly route=inject(ActivatedRoute);private readonly destroy=inject(DestroyRef);readonly navigation=inject(AuditNavigationService);
  private pending?:Subscription;private detailRequest?:Subscription;private current:Record<string,string>={};private fingerprint='';private returnFocus?:HTMLElement;
  @ViewChild('detailsDialog')dialog?:ElementRef<HTMLElement>;
  readonly page=signal<AuditPage|null>(null);readonly loading=signal(true);readonly denied=signal(false);readonly error=signal('');readonly cursor=signal('');readonly history=signal<string[]>([]);
  readonly advanced=computed(()=>this.config.config().advancedAuditUsage===true);readonly correlation=signal('');readonly exportBusy=signal(false);readonly exportStatus=signal('');private exportRequest?:Subscription;private exportGeneration=0;
  readonly action=signal('');readonly actor=signal('');readonly resourceType=signal('');readonly resourceId=signal('');readonly projectId=signal('');readonly start=signal('');readonly end=signal('');readonly limit=signal('25');
  readonly dialogOpen=signal(false);readonly detailLoading=signal(false);readonly detail=signal<AuditEvent|null>(null);readonly detailError=signal('');readonly copyStatus=signal('');
  private readonly applied=signal<Record<string,string>>({});
  readonly activeFilters=computed(()=>Object.entries(this.applied()).filter(([k,v])=>v&&k!=='limit'&&k!=='cursor').map(([k,v])=>k+': '+v));
  readonly unknownAction=computed(()=>this.action()&&!this.navigation.actions().some(a=>a.value===this.action()));
  readonly rows=computed(()=>this.page()?.items.map(e=>({...e,timeLabel:new Date(e.timestamp).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC',actorShort:e.actorLabel,resource:e.resourceType+' / '+e.resourceId}))??[]);
  readonly columns=[{accessor:'timeLabel',header:'Time (UTC)'},{accessor:'actionLabel',header:'Action'},{accessor:'actorShort',header:'Actor'},{accessor:'resource',header:'Resource',cellSlot:(row:{id:string})=>'audit-resource-'+row.id},{accessor:'summary',header:'Change summary',cellSlot:(row:{id:string})=>'audit-summary-'+row.id}];
  readonly features={sorting:false,filtering:false,globalSearch:false,pagination:false,rowSelection:false,columnVisibility:false,columnResizing:false,rowActions:true};
  private get url(){return this.config.config().adminApiBaseUrl+'/bff/organization/audit';}
  constructor(){this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params=>{
    const q:Record<string,string>={};for(const key of params.keys)q[key]=params.get(key)!;
    const filter=JSON.stringify(Object.entries(q).filter(([k])=>k!=='cursor').sort());if(filter!==this.fingerprint){this.history.set([]);this.fingerprint=filter;}
    this.cancelExport();this.correlation.set(q['correlationId']??'');this.current=q;this.applied.set(q);this.action.set(q['action']??'');this.actor.set(q['actorId']??'');this.resourceType.set(q['resourceType']??'');this.resourceId.set(q['resourceId']??'');this.projectId.set(q['projectId']??'');this.start.set((q['start']??'').replace(/Z$/,''));this.end.set((q['end']??'').replace(/Z$/,''));this.limit.set(q['limit']??'25');this.cursor.set(q['cursor']??'');this.closeDetails();this.load();
  });this.destroy.onDestroy(()=>this.cancelExport());}
  ngAfterViewInit(){this.dialog?.nativeElement.shadowRoot?.querySelector('[part="dialog"]')?.setAttribute('aria-label','Audit event details');}
  private currentFilters(){return {correlationId:this.correlation(),action:this.action(),actorId:this.actor(),resourceType:this.resourceType(),resourceId:this.resourceId(),projectId:this.projectId(),start:this.start(),end:this.end(),limit:this.limit()};}
  load(){this.pending?.unsubscribe();this.loading.set(true);this.error.set('');this.denied.set(false);this.page.set(null);
    this.pending=this.http.get<AuditPage>(this.url,{withCredentials:true,params:new HttpParams({fromObject:this.current})}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:p=>{this.page.set(p);this.loading.set(false);},error:e=>this.handle(e)});
  }
  apply(){const filters=this.currentFilters();if((filters.start||filters.end)&&(!filters.start||!filters.end||!Number.isFinite(Date.parse(filters.start+'Z'))||!Number.isFinite(Date.parse(filters.end+'Z'))||Date.parse(filters.start+'Z')>=Date.parse(filters.end+'Z'))){this.error.set('Supply an increasing UTC start and end.');return;}
    const q:Record<string,string>={};for(const [k,v]of Object.entries(filters))if(v)q[k]=(k==='start'||k==='end')?v+'Z':v;
    this.history.set([]);void this.router.navigate([],{relativeTo:this.route,queryParams:q});
  }
  clear(){this.history.set([]);void this.router.navigate([],{relativeTo:this.route,queryParams:{}});}
  next(){const next=this.page()?.nextCursor;if(next){this.history.update(h=>[...h,this.cursor()]);void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.current,cursor:next}});}}
  previous(){const h=[...this.history()],previous=h.pop();this.history.set(h);void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.current,cursor:previous||null}});}
  first(){this.history.set([]);void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.current,cursor:null}});}
  openDetails(id:string,event?:Event){this.returnFocus=event?.currentTarget as HTMLElement|undefined;this.detailRequest?.unsubscribe();this.detail.set(null);this.detailError.set('');this.copyStatus.set('');this.detailLoading.set(true);this.dialogOpen.set(true);
    this.detailRequest=this.http.get<AuditEvent>(this.url+'/'+encodeURIComponent(id),{withCredentials:true}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:d=>{this.detail.set(d);this.detailLoading.set(false);},error:e=>{this.detailLoading.set(false);if(e.status===401){this.closeDetails();this.auth.logout();void this.router.navigateByUrl('/login');return;}this.detailError.set([403,404].includes(e.status)?'Audit event is not accessible.':'Audit details are unavailable. Close and retry.');}});
  }
  closeDetails(){this.detailRequest?.unsubscribe();this.dialogOpen.set(false);this.detail.set(null);this.detailError.set('');this.copyStatus.set('');const trigger=this.returnFocus;this.returnFocus=undefined;if(trigger)queueMicrotask(()=>{const button=trigger.shadowRoot?.querySelector<HTMLButtonElement>('button');if(button)button.focus();else trigger.focus();});}
  trapDetails(event:Event){
    const key=event as KeyboardEvent,host=this.dialog?.nativeElement;if(!host||!this.dialogOpen()||key.key!=='Tab')return;
    // Bridge the native Platform dialog's shadow header and our slotted action buttons.
    const controls=[host.shadowRoot?.querySelector<HTMLButtonElement>('[part="close"]'),...Array.from(host.querySelectorAll<HTMLElement>('skyra-tech-button')).map(el=>el.shadowRoot?.querySelector<HTMLButtonElement>('button'))].filter((el):el is HTMLButtonElement=>!!el&&!el.disabled&&el.getClientRects().length>0);
    if(!controls.length)return;let active:Element|null=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
    if(key.shiftKey&&active===controls[0]){key.preventDefault();controls.at(-1)!.focus();}
    else if(!key.shiftKey&&active===controls.at(-1)){key.preventDefault();controls[0]!.focus();}
  }
  cancelExport(){this.exportGeneration++;this.exportRequest?.unsubscribe();this.exportRequest=undefined;if(this.exportBusy())this.exportStatus.set('Audit export cancelled. No new download created.');this.exportBusy.set(false);}
  exportMatching(format:'json'|'csv'){
    if(!this.advanced()||this.exportBusy()||this.loading()||this.denied()||!this.page())return;
    const filters={...this.current};delete filters['cursor'];delete filters['limit'];const generation=++this.exportGeneration;this.exportBusy.set(true);this.exportStatus.set('Preparing matching audit records within server limits…');
    this.exportRequest=this.http.post(this.url+'/export',{format,filters},{withCredentials:true,headers:{'X-CSRF-Token':this.auth.csrfToken()},observe:'response',responseType:'blob'}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{if(generation!==this.exportGeneration)return;this.exportBusy.set(false);if(!r.body||r.body.size>5*1024*1024){this.exportStatus.set('Invalid export. No download created.');return;}const truncated=r.headers.get('X-Export-Truncated')==='true',url=URL.createObjectURL(r.body),a=document.createElement('a');a.href=url;a.download='skyra-audit-matching'+(truncated?'-truncated':'')+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.exportStatus.set((truncated?'Truncated audit export downloaded. Narrow the filters for the remainder. ':'Audit export downloaded. ')+(r.headers.get('X-Export-Count')??'')+' records; fixed watermark traversal, not a global snapshot.');},error:e=>{if(generation!==this.exportGeneration)return;this.exportBusy.set(false);this.exportStatus.set(e.status===429?'Audit export capacity is occupied. Retry after completion.':[401,403].includes(e.status)?'Audit export permission changed. No download created.':'Audit export failed or was interrupted. No complete download created.');if([401,403].includes(e.status)){this.page.set(null);this.denied.set(true);}if(e.status===401){this.auth.logout();void this.router.navigateByUrl('/login');}}});
  }
  value(value:string|boolean|null,available:boolean){return !available?'Not recorded':value===null?'Unlimited':String(value);}
  async copy(){const id=this.detail()?.id;if(!id)return;try{await navigator.clipboard.writeText(id);this.copyStatus.set('Event ID copied.');}catch{this.copyStatus.set('Copy unavailable. Select the event ID text manually.');}}
  private handle(e:HttpErrorResponse){this.loading.set(false);this.page.set(null);this.denied.set([403,404].includes(e.status));if(e.status===401){this.auth.logout();void this.router.navigateByUrl('/login');return;}this.error.set(this.denied()?'You do not have permission to read organization audit history.':e.status===400?'Invalid or expired filters/cursor. Return to the first page or clear filters.':'Audit history is unavailable. Retry to load persisted records.');}
}
