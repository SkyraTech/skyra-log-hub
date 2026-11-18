import { Injectable,BadRequestException,ForbiddenException,NotFoundException,HttpException,ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { adminPrisma } from '../../core/database/admin-prisma.js';
import type { TrustedPrincipal } from '../../core/security/trusted-assertion.guard.js';
import { PrismaAuditRepository } from '../../core/audit/infrastructure/prisma-audit.repository.js';
import { EffectivePermissionResolver } from '../authorization/application/effective-permission.resolver.js';
import { RBAC_ROLE_CAPABILITIES } from '../authorization/domain/rbac-matrix.js';
import { SYSTEM_ROLES,type SystemRole } from '../authorization/domain/role.model.js';
import type { AdminCapability } from '../authorization/domain/permission.model.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states=['ACTIVE','SUSPENDED','REVOKED','PENDING_INVITE'] as const;
export function memberChange(body:unknown):{role?:SystemRole;status?:'ACTIVE'|'SUSPENDED'|'REVOKED'} {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1)throw new BadRequestException('Provide exactly one role or status.');
  const value=body as Record<string,unknown>;
  if(Object.hasOwn(value,'role')&&typeof value.role==='string'&&Object.hasOwn(SYSTEM_ROLES,value.role))return {role:value.role as SystemRole};
  if(Object.hasOwn(value,'status')&&typeof value.status==='string'&&['ACTIVE','SUSPENDED','REVOKED'].includes(value.status))return {status:value.status as 'ACTIVE'|'SUSPENDED'|'REVOKED'};
  throw new BadRequestException('Unsupported membership change.');
}
export function memberVersion(value:string|undefined,id:string):string {
  if(!value)throw new HttpException('If-Match is required.',428);
  const match=/^"m([0-9a-f-]{36}):([0-9]{1,19})"$/i.exec(value);
  if(!match||!uuid.test(match[1]!)||BigInt(match[2]!)>9223372036854775807n)throw new BadRequestException('Invalid membership precondition.');
  if(match[1]!==id)throw new ConflictException('Membership context changed.');return match[2]!;
}
export function memberQuery(query:Record<string,unknown>) {
  if(Object.keys(query).some(k=>!['q','status','role','limit','cursor'].includes(k)))throw new BadRequestException('Unsupported member filter.');
  if(Object.values(query).some(v=>typeof v!=='string'))throw new BadRequestException('Filters must be strings.');
  const q=String(query.q??'').trim(),status=String(query.status??''),role=String(query.role??''),limitText=String(query.limit??'20');
  if(q.length>100||q.includes('\0')||String(query.cursor??'').length>2048||(status&&!states.includes(status as any))||(role&&!Object.hasOwn(SYSTEM_ROLES,role))||!/^\d+$/.test(limitText)||Number(limitText)<1||Number(limitText)>100)throw new BadRequestException('Invalid member filter.');
  return {q,status,role,limit:Number(limitText),cursor:String(query.cursor??'')};
}

@Injectable()
export class MembersManagementService {
  constructor(private readonly config:AdminConfigService,private readonly resolver:EffectivePermissionResolver) {}
  private get db(){return adminPrisma(this.config);}
  private async assignments(tx:Prisma.TransactionClient,tenantId:string,userId:string){
    return (await tx.roleAssignment.findMany({where:{tenantId,userId},include:{role:true},orderBy:{id:'asc'}})).map(row=>({tenantId,userId,role:row.role.name as SystemRole,projectId:row.projectId}));
  }
  private async authorize(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,manage:boolean){
    if(!uuid.test(tenantId)||p.tenantId!==tenantId||p.scope!==(manage?'members.manage':'members.read')||!p.identityIssuer||!this.config.isIssuerTrusted(p.identityIssuer))throw new ForbiddenException('Membership access denied.');
    // All administrative writes lock tenant first; reads use SHARE in their caller.
    const tenant=await tx.tenant.findUnique({where:{id:tenantId}});if(!tenant)throw new ForbiddenException('Membership access denied.');
    if(manage&&tenant.status!=='ACTIVE')throw new ConflictException('Organization is read-only.');
    const user=await tx.user.findUnique({where:{issuer_subject:{issuer:p.identityIssuer,subject:p.sub}}});
    if(!user||user.status!=='ACTIVE')throw new ForbiddenException('Membership access denied.');
    const active=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${user.id}::uuid AND status='ACTIVE' FOR SHARE`;
    if(!active.length)throw new ForbiddenException('Membership access denied.');
    const membership=await tx.tenantMembership.findUnique({where:{tenantId_userId:{tenantId,userId:user.id}}});
    if(!membership||membership.status!=='ACTIVE')throw new ForbiddenException('Membership access denied.');
    const roles=await this.assignments(tx,tenantId,user.id),caps=this.resolver.resolveEffectiveCapabilities(roles,tenantId);
    this.resolver.assertHasCapability(caps,manage?'tenant.members.manage':'tenant.members.read');
    return {user,caps,tenantActive:tenant.status==='ACTIVE'};
  }
  private allowed(caps:Set<AdminCapability>,role:string){return Object.hasOwn(RBAC_ROLE_CAPABILITIES,role)&&RBAC_ROLE_CAPABILITIES[role as SystemRole].every(cap=>caps.has(cap));}
  private async projection(tx:Prisma.TransactionClient,tenantId:string,id:string,actor:{user:{id:string};caps:Set<AdminCapability>;tenantActive:boolean}){
    const row=await tx.tenantMembership.findFirst({where:{tenantId,id},include:{user:{select:{id:true,displayName:true,email:true,status:true}}}});
    if(!row)throw new NotFoundException('Membership not found.');
    const roles=await this.assignments(tx,tenantId,row.userId);
    const tenantRoles=roles.filter(r=>r.projectId===null).map(r=>r.role).sort();
    const canManage=actor.tenantActive&&actor.caps.has('tenant.members.manage')&&row.user.status==='ACTIVE'&&['ACTIVE','SUSPENDED'].includes(row.status)&&tenantRoles.every(r=>this.allowed(actor.caps,r));
    const version=(await tx.$queryRaw<Array<{version:string}>>`SELECT (extract(epoch FROM updated_at)*1000000)::bigint::text AS version FROM tenant_memberships WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid`)[0]!.version;
    const owners=await tx.tenantMembership.count({where:{tenantId,status:'ACTIVE',user:{status:'ACTIVE',roleAssignments:{some:{tenantId,projectId:null,role:{name:'OrgOwner'}}}}}});
    const lastOwner=row.status==='ACTIVE'&&tenantRoles.includes('OrgOwner')&&owners<=1;
    return {id:row.id,userId:row.userId,displayName:row.user.displayName,email:row.user.email,identityStatus:row.user.status,status:row.status,
      roles:tenantRoles,projectRoles:roles.filter(r=>r.projectId!==null).map(r=>({role:r.role,projectId:r.projectId})),scope:'organization' as const,
      version:`"m${id}:${version}"`,self:row.userId===actor.user.id,lastOwner,
      permittedRoles:canManage?Object.keys(SYSTEM_ROLES).filter(r=>this.allowed(actor.caps,r)&&(!lastOwner||r==='OrgOwner')):[],
      actions:{changeRole:canManage&&!lastOwner,suspend:canManage&&!lastOwner&&row.status==='ACTIVE',reactivate:canManage&&row.status==='SUSPENDED',revoke:canManage&&!lastOwner},createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
  }
  private async readLock(tx:Prisma.TransactionClient,tenantId:string){
    if(!uuid.test(tenantId))throw new ForbiddenException('Membership access denied.');
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR SHARE`;
  }
  list(p:TrustedPrincipal,tenantId:string,query:Record<string,unknown>){
    const input=memberQuery(query);
    return this.db.$transaction(async tx=>{
      await this.readLock(tx,tenantId);const actor=await this.authorize(tx,p,tenantId,false);
      const where:Prisma.TenantMembershipWhereInput={tenantId,...(input.status?{status:input.status as any}:{}),
        ...(input.q?{user:{OR:[{displayName:{contains:input.q,mode:'insensitive'}},{email:{contains:input.q,mode:'insensitive'}}]}}:{}),
        ...(input.role?{user:{AND:[...(input.q?[{OR:[{displayName:{contains:input.q,mode:'insensitive' as const}},{email:{contains:input.q,mode:'insensitive' as const}}]}]:[]),{roleAssignments:{some:{tenantId,projectId:null,role:{name:input.role}}}}]}}:{})};
      const fingerprint=JSON.stringify([tenantId,input.q,input.status,input.role,input.limit]);let cursor:string|undefined;
      if(input.cursor){try{const decoded=JSON.parse(Buffer.from(input.cursor,'base64url').toString());if(decoded.filter!==fingerprint||!uuid.test(decoded.id))throw Error();cursor=decoded.id;}catch{throw new BadRequestException('Invalid member cursor.');}if(!await tx.tenantMembership.findFirst({where:{AND:[where,{id:cursor}]}}))throw new BadRequestException('Expired member cursor; reload the list.');}
      const rows=await tx.tenantMembership.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],take:input.limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});
      const more=rows.length>input.limit,items=[];for(const row of rows.slice(0,input.limit))items.push(await this.projection(tx,tenantId,row.id,actor));
      return {items,nextCursor:more?Buffer.from(JSON.stringify({id:items.at(-1)!.id,filter:fingerprint})).toString('base64url'):null,
        capabilities:[...actor.caps].filter(c=>c==='tenant.members.read'||c==='tenant.members.manage'),roles:Object.entries(SYSTEM_ROLES).map(([name,r])=>({name,description:r.description,capabilities:RBAC_ROLE_CAPABILITIES[name as SystemRole]}))};
    },{timeout:15000});
  }
  read(p:TrustedPrincipal,tenantId:string,id:string){if(!uuid.test(id))throw new NotFoundException('Membership not found.');return this.db.$transaction(async tx=>{await this.readLock(tx,tenantId);const actor=await this.authorize(tx,p,tenantId,false);return this.projection(tx,tenantId,id,actor);});}
  update(p:TrustedPrincipal,tenantId:string,id:string,body:unknown,ifMatch:string|undefined,correlationId:string){
    if(!uuid.test(id)||!uuid.test(tenantId))throw new NotFoundException('Membership not found.');
    const change=memberChange(body),version=memberVersion(ifMatch,id);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const actor=await this.authorize(tx,p,tenantId,true),before=await this.projection(tx,tenantId,id,actor);
      const active=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${before.userId}::uuid AND status='ACTIVE' FOR SHARE`;
      if(!active.length)throw new ConflictException('Identity is not active.');
      if(before.version!==ifMatch)throw new ConflictException('Membership changed; reload before retrying.');
      if(before.identityStatus!=='ACTIVE'||!['ACTIVE','SUSPENDED'].includes(before.status))throw new ConflictException('Membership or identity is not editable.');
      if(!before.roles.every(r=>this.allowed(actor.caps,r)))throw new ForbiddenException('You cannot manage this membership role.');
      if(change.role&&!this.allowed(actor.caps,change.role))throw new ForbiddenException('You cannot grant that role.');
      if(change.status && !(before.status==='ACTIVE'&&['SUSPENDED','REVOKED'].includes(change.status)||before.status==='SUSPENDED'&&['ACTIVE','REVOKED'].includes(change.status)))throw new ConflictException('Unsupported membership transition.');
      if(before.lastOwner&&(change.role&&change.role!=='OrgOwner'||change.status))throw new ConflictException('The last active OrgOwner cannot be demoted, suspended or revoked.');
      if(change.role&&before.roles.length===1&&before.roles[0]===change.role)return before;
      // Atomic version update; role and status operations always advance the membership ETag.
      const changed=await tx.$executeRaw`UPDATE tenant_memberships SET updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND (extract(epoch FROM updated_at)*1000000)::bigint=${BigInt(version)}`;
      if(changed!==1)throw new ConflictException('Membership changed.');
      if(change.role){const role=await tx.role.findUnique({where:{name:change.role}});if(!role||!role.isSystem)throw new ConflictException('Canonical role is unavailable.');await tx.roleAssignment.deleteMany({where:{tenantId,userId:before.userId,projectId:null}});await tx.roleAssignment.create({data:{tenantId,userId:before.userId,roleId:role.id,projectId:null}});}
      if(change.status){await tx.tenantMembership.update({where:{id},data:{status:change.status}});if(change.status==='REVOKED')await tx.projectMembership.updateMany({where:{tenantId,userId:before.userId},data:{status:'REVOKED',updatedAt:new Date()}});}
      const afterActor=before.userId===actor.user.id?{...actor,caps:change.status&&change.status!=='ACTIVE'?new Set<AdminCapability>():this.resolver.resolveEffectiveCapabilities(await this.assignments(tx,tenantId,actor.user.id),tenantId)}:actor;
      const after=await this.projection(tx,tenantId,id,afterActor);
      await new PrismaAuditRepository(this.config).recordAuditEvent({tenantId,actorUserId:actor.user.id,actorEmail:actor.user.email,
        action:change.role?'MEMBER_ROLE_CHANGED':change.status==='SUSPENDED'?'MEMBER_SUSPENDED':change.status==='ACTIVE'?'MEMBER_REACTIVATED':'MEMBER_REMOVED',targetType:'membership',targetId:id,
        details:{before:{roles:before.roles,status:before.status},after:{roles:after.roles,status:after.status},correlationId,outcome:'SUCCESS'}},tx);
      return after;
    },{timeout:15000,maxWait:5000});
  }
}
