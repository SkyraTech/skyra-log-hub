import {Injectable,ForbiddenException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {AdminConfigService} from '../../config/admin-config.service.js';
import {adminPrisma} from '../../database/admin-prisma.js';
import type {TrustedPrincipal} from '../../security/trusted-assertion.guard.js';
import {EffectivePermissionResolver} from '../../../modules/authorization/application/effective-permission.resolver.js';
import type {SystemRole} from '../../../modules/authorization/domain/role.model.js';
import {PrismaAuditReadRepository} from '../infrastructure/prisma-audit-read.repository.js';
import {auditQuery,auditUuid,auditBinding,readAuditCursor,signAuditCursor} from './audit-query.js';
import {AUDIT_ACTIONS,projectAudit,safeAuditText} from './audit-projection.js';
@Injectable()
export class AuditHistoryService {
  private readonly repository=new PrismaAuditReadRepository();
  constructor(private readonly config:AdminConfigService,private readonly permissions:EffectivePermissionResolver){}
  private async authorized(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenant:string){
    if(!auditUuid.test(tenant)||p.tenantId!==tenant||p.scope!=='audit.read'||!p.identityIssuer||!this.config.isIssuerTrusted(p.identityIssuer))throw new ForbiddenException('Audit history access denied.');
    const org=await tx.tenant.findUnique({where:{id:tenant}});if(org?.status!=='ACTIVE')throw new ForbiddenException('Audit history access denied.');
    const user=await tx.user.findUnique({where:{issuer_subject:{issuer:p.identityIssuer,subject:p.sub}}});
    if(user?.status!=='ACTIVE'||!await tx.tenantMembership.findFirst({where:{tenantId:tenant,userId:user.id,status:'ACTIVE'}}))throw new ForbiddenException('Audit history access denied.');
    // Canonical audit.read is tenant-wide for OrgOwner/OrgAdmin only. Scoped roles grant no organization audit access.
    const rows=await tx.roleAssignment.findMany({where:{tenantId:tenant,userId:user.id,projectId:null},include:{role:true}});
    const caps=this.permissions.resolveEffectiveCapabilities(rows.map(r=>({tenantId:tenant,userId:user.id,role:r.role.name as SystemRole,projectId:null})),tenant);
    this.permissions.assertHasCapability(caps,'audit.read');return user.id;
  }
  private run<T>(p:TrustedPrincipal,tenant:string,read:(tx:Prisma.TransactionClient,user:string)=>Promise<T>){
    if(!this.config.auditHistoryEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Audit history is not activated.');
    return adminPrisma(this.config).$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
      return read(tx,await this.authorized(tx,p,tenant));
    },{isolationLevel:'RepeatableRead',timeout:10000});
  }
  private async enrich(tx:Prisma.TransactionClient,tenant:string,rows:Record<string,any>[]){
    const ids=[...new Set(rows.map(r=>r.actor_user_id).filter((id):id is string=>typeof id==='string'&&auditUuid.test(id)))];
    const members=ids.length?await tx.tenantMembership.findMany({where:{tenantId:tenant,userId:{in:ids}},select:{user:{select:{id:true,displayName:true}}}}):[];
    const names=new Map(members.map(m=>[m.user.id,m.user.displayName]));
    return rows.map(row=>{const event=projectAudit(row),raw=names.get(event.actorId??''),name=safeAuditText(raw,80);const display=name&&!/[@\p{Cf}]/u.test(name)?name:null;return {...event,actorDisplayName:display,actorLabel:display?display+' · Actor '+event.actorId:event.actorLabel};});
  }
  access(p:TrustedPrincipal,tenant:string){return this.run(p,tenant,async()=>({canRead:true as const,actions:Object.entries(AUDIT_ACTIONS).map(([value,label])=>({value,label}))}));}
  list(p:TrustedPrincipal,tenant:string,raw:Record<string,unknown>){const q=auditQuery(raw);return this.run(p,tenant,async(tx,user)=>{
    const binding=auditBinding(q,tenant,user),cursor=q.cursor?readAuditCursor(this.config.internalJwtSecret,q.cursor,binding):null;
    const anchor=cursor?.anchor??await this.repository.anchor(tx),rows=await this.repository.list(tx,tenant,q,anchor,cursor?.last),items=await this.enrich(tx,tenant,rows.slice(0,Number(q.limit))),last=items.at(-1);
    return {tenantId:tenant,watermark:anchor,items,nextCursor:rows.length>Number(q.limit)&&last?signAuditCursor(this.config.internalJwtSecret,binding,anchor,{timestamp:last.timestamp,id:last.id},cursor?.expires):null,order:'timestamp_desc_id_desc' as const,pageSize:Number(q.limit)};
  });}
  read(p:TrustedPrincipal,tenant:string,id:string){return this.run(p,tenant,async tx=>{
    if(!auditUuid.test(id))throw new NotFoundException('Audit event not found.');const row=await this.repository.read(tx,tenant,id);if(!row)throw new NotFoundException('Audit event not found.');return (await this.enrich(tx,tenant,[row]))[0]!;
  });}
}
