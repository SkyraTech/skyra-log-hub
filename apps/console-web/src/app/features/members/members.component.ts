import {AuditLinkComponent} from '../audit/audit-link.component';
import {Component,ChangeDetectionStrategy,CUSTOM_ELEMENTS_SCHEMA,inject,signal,computed,DestroyRef,HostListener,ViewChild,ElementRef,AfterViewInit,AfterViewChecked} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute,Router} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {HttpErrorResponse} from '@angular/common/http';
import {forkJoin,Subscription} from 'rxjs';
import {AuthService} from '../../core/auth/auth.service';
import {MembersApiService,type MemberRole,type MemberView,type MembersPage} from './members-api.service';
@Component({selector:'skyra-members',standalone:true,imports:[CommonModule,AuditLinkComponent],schemas:[CUSTOM_ELEMENTS_SCHEMA],templateUrl:'./members.component.html',styleUrl:'./members.component.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class MembersComponent implements AfterViewInit,AfterViewChecked {
  private readonly element=inject<ElementRef<HTMLElement>>(ElementRef);
  @HostListener('skyra-dropdown-open')
  ngAfterViewChecked(){
    // The pinned dropdown duplicates menuitem roles on the wrapper and its native
    // button. Keep only the native interactive role in this feature's menus.
    this.element.nativeElement.querySelectorAll('skyra-tech-dropdown-menu').forEach(menu=>menu.querySelectorAll('skyra-dropdown-item').forEach(item=>item.setAttribute('role','presentation')));
  }
  @ViewChild('confirmationDialog')private confirmationDialog?:ElementRef<HTMLElement>;
  ngAfterViewInit(){
    // The pinned Platform dialog exports its native dialog part but no label input.
    // Name that existing accessible dialog; keep native modal/focus behavior intact.
    this.confirmationDialog?.nativeElement.shadowRoot?.querySelector<HTMLDialogElement>('[part="dialog"]')?.setAttribute('aria-label','Confirm membership change');
  }
  private readonly api=inject(MembersApiService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);private readonly auth=inject(AuthService);private pending?:Subscription;
  readonly id=this.route.snapshot.paramMap.get('membershipId');readonly page=signal<MembersPage|null>(null);readonly member=signal<MemberView|null>(null);
  readonly loading=signal(true);readonly saving=signal(false);readonly denied=signal(false);readonly error=signal('');readonly success=signal('');readonly conflict=signal(false);
  readonly search=signal('');readonly status=signal('');readonly role=signal('');readonly selectedRole=signal<MemberRole|''>('');readonly cursor=signal('');readonly history=signal<string[]>([]);
  readonly confirmation=signal<{label:string;body:{role?:MemberRole;status?:string}}|null>(null);
  readonly dirty=computed(()=>!!this.member()&&!!this.selectedRole()&&this.member()!.roles.join(',')!==this.selectedRole());
  readonly rows=computed(()=>this.page()?.items.map(m=>({...m,name:m.displayName||m.email,assignedRoles:m.roles.join(', ')||'No organization role',projectScope:m.projectRoles.length?`${m.projectRoles.length} project grant(s)`:'Organization'}))??[]);
  readonly columns=[{accessor:'name',header:'Member'},{accessor:'email',header:'Contact'},{accessor:'assignedRoles',header:'Organization role'},{accessor:'status',header:'Membership status'},{accessor:'projectScope',header:'Scope'}];
  readonly tableFeatures={sorting:false,filtering:false,globalSearch:false,pagination:false,rowSelection:false,columnVisibility:false,columnResizing:false,rowActions:true};
  readonly statusItems=computed(()=>['','ACTIVE','SUSPENDED','REVOKED','PENDING_INVITE'].map(v=>({label:v||'All statuses',onClick:()=>{this.status.set(v);this.apply();}})));
  readonly roleItems=computed(()=>['','OrgOwner','OrgAdmin','ProjectAdmin','Developer','Viewer'].map(v=>({label:v||'All roles',onClick:()=>{this.role.set(v);this.apply();}})));
  readonly editItems=computed(()=>this.member()?.permittedRoles.map(v=>({label:v,onClick:()=>this.selectedRole.set(v)}))??[]);
  readonly explanation=computed(()=>this.page()?.roles.find(r=>r.name===this.selectedRole()));
  constructor(){this.load();}
  load(){this.pending?.unsubscribe();this.loading.set(true);this.error.set('');this.denied.set(false);this.conflict.set(false);
    const filters={limit:'10',...(this.search()?{q:this.search()}:{}),...(this.status()?{status:this.status()}:{}),...(this.role()?{role:this.role()}:{}),...(this.cursor()?{cursor:this.cursor()}:{})};
    if(this.id){this.pending=forkJoin({member:this.api.read(this.id),page:this.api.list({limit:'1'})}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:result=>{this.member.set(result.member);this.selectedRole.set(result.member.roles.length===1?result.member.roles[0]!:'');this.page.set(result.page);this.loading.set(false);},error:error=>{this.loading.set(false);this.handle(error);}});}
    else this.pending=this.api.list(filters).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:page=>{this.page.set(page);this.loading.set(false);},error:error=>{this.loading.set(false);this.handle(error);}});
  }
  apply(){this.history.set([]);this.cursor.set('');this.load();}
  next(){const cursor=this.page()?.nextCursor;if(cursor){this.history.update(h=>[...h,this.cursor()]);this.cursor.set(cursor);this.load();}}
  previous(){const history=[...this.history()];this.cursor.set(history.pop()??'');this.history.set(history);this.load();}
  open(id:string){void this.router.navigate(['/organization/members',id]);}
  back(){void this.router.navigateByUrl('/organization/members');}
  requestRole(){if(this.member()?.actions.changeRole&&this.dirty()&&this.selectedRole())this.confirmation.set({label:'Change organization role',body:{role:this.selectedRole() as MemberRole}});}
  requestStatus(status:string){const m=this.member();if(!m)return;const allowed=status==='SUSPENDED'?m.actions.suspend:status==='ACTIVE'?m.actions.reactivate:m.actions.revoke;if(allowed)this.confirmation.set({label:status==='SUSPENDED'?'Suspend membership':status==='ACTIVE'?'Reactivate membership':'Revoke membership',body:{status}});}
  cancel(){this.selectedRole.set(this.member()?.roles.length===1?this.member()!.roles[0]!: '');this.error.set('');this.success.set('');}
  confirm(){const proposed=this.confirmation(),member=this.member();if(!proposed||!member||this.saving()||this.conflict())return;this.confirmation.set(null);this.saving.set(true);this.error.set('');this.success.set('');
    this.api.update(member.id,proposed.body,member.version).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:value=>{this.member.set(value);this.selectedRole.set(value.roles.length===1?value.roles[0]!:'');this.saving.set(false);this.success.set('Membership saved.');},error:error=>{this.saving.set(false);this.handle(error);}});
  }
  reload(){if(!this.dirty()||window.confirm('Discard the role draft and reload the member?')){this.success.set('');this.load();}}
  canLeave(){return !this.dirty()||window.confirm('Discard unsaved member role changes?');}
  @HostListener('window:beforeunload',['$event'])unload(event:BeforeUnloadEvent){if(this.dirty()&&!this.loading()){event.preventDefault();event.returnValue='';}}
  private handle(error:HttpErrorResponse){this.denied.set(error.status===403||error.status===404);this.conflict.set([409,412,428].includes(error.status));
    if(error.status===401){this.auth.logout();void this.router.navigateByUrl('/login');return;}
    if(this.denied()){this.page.set(null);this.member.set(null);}
    this.error.set(this.denied()?'You do not have permission to view or manage these members.':this.conflict()?'Membership changed or this transition is not permitted. Reload before retrying. Your draft was not saved.':'Member service is unavailable. Your changes were not saved. Retry later.');
  }
}
