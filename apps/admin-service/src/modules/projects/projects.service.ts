import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException, HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { adminPrisma } from '../../core/database/admin-prisma.js';
import type { TrustedPrincipal } from '../../core/security/trusted-assertion.guard.js';
import { EffectivePermissionResolver } from '../authorization/application/effective-permission.resolver.js';
import type { SystemRole } from '../authorization/domain/role.model.js';
import { PrismaAuditRepository } from '../../core/audit/infrastructure/prisma-audit.repository.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const code=/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
export function projectInput(raw:unknown,create=false):{name?:string;id?:string;status?:'ACTIVE'|'SUSPENDED'|'ARCHIVED'} {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid project request.');
  const d=raw as Record<string,unknown>,keys=Object.keys(d);
  if(!keys.length||keys.some(k=>!(create?['name','id','status']:['name','status']).includes(k))||(!create&&keys.length!==1)||create&&!Object.hasOwn(d,'name'))throw new BadRequestException('Unsupported project fields.');
  const result:any={};
  if(Object.hasOwn(d,'name')){if(typeof d.name!=='string')throw new BadRequestException('Name must be text.');const n=d.name.trim();if(Array.from(n).length<2||Array.from(n).length>255||/[\u0000-\u001f\u007f]/.test(n))throw new BadRequestException('Name must contain 2–255 characters without controls.');result.name=n;}
  if(Object.hasOwn(d,'id')){if(typeof d.id!=='string'||!code.test(d.id))throw new BadRequestException('Use a 3–64 character lowercase project code.');result.id=d.id;}
  if(Object.hasOwn(d,'status')){if(typeof d.status!=='string'||!['ACTIVE','SUSPENDED','ARCHIVED'].includes(d.status)||create&&d.status!=='ACTIVE')throw new BadRequestException('Unsupported project status.');result.status=d.status;}
  return result;
}
export function projectQuery(q:Record<string,unknown>){
  if(Object.keys(q).some(k=>!['q','status','sort','direction','limit','cursor','page'].includes(k))||Object.values(q).some(v=>typeof v!=='string'))throw new BadRequestException('Invalid project filters.');
  const search=String(q.q??'').trim(),status=String(q.status??''),sort=String(q.sort??'createdAt'),direction=String(q.direction??'asc'),limit=String(q.limit??'20'),cursor=String(q.cursor??'');
  if(search.length>100||search.includes('\0')||status&&!['ACTIVE','SUSPENDED','ARCHIVED'].includes(status)||!['createdAt','name','id'].includes(sort)||!['asc','desc'].includes(direction)||!/^\d+$/.test(limit)||+limit<1||+limit>100||cursor.length>2048||q.page!==undefined&&q.page!=='true')throw new BadRequestException('Invalid project filters.');
  return {search,status,sort:sort as 'createdAt'|'name'|'id',direction:direction as 'asc'|'desc',limit:+limit,cursor};
}
@Injectable()
export class ProjectsService {
  constructor(private readonly config:AdminConfigService,private readonly resolver:EffectivePermissionResolver){}
  private get db(){return adminPrisma(this.config);}
  private async actor(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,write=false,expectedScope?:string){
    if(!uuid.test(tenantId)||p.tenantId!==tenantId||p.scope!==(expectedScope??(write?'projects.manage':'projects.read'))||!p.identityIssuer||!this.config.isIssuerTrusted(p.identityIssuer))throw new ForbiddenException('Project access denied.');
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR SHARE`;
    const tenant=await tx.tenant.findUnique({where:{id:tenantId}});
    if(!tenant||tenant.status!=='ACTIVE')throw new ForbiddenException('Project access denied.');
    const user=await tx.user.findUnique({where:{issuer_subject:{issuer:p.identityIssuer,subject:p.sub}}});
    if(!user||user.status!=='ACTIVE')throw new ForbiddenException('Project access denied.');
    const locked=await tx.$queryRaw<any[]>`SELECT id FROM users WHERE id=${user.id}::uuid AND status='ACTIVE' FOR SHARE`;
    if(!locked.length||!(await tx.tenantMembership.findFirst({where:{tenantId,userId:user.id,status:'ACTIVE'}})))throw new ForbiddenException('Project access denied.');
    const rows=await tx.roleAssignment.findMany({where:{tenantId,userId:user.id},include:{role:true}});
    const assignments=rows.map(r=>({tenantId,userId:user.id,role:r.role.name as SystemRole,projectId:r.projectId}));
    const tenantCaps=this.resolver.resolveEffectiveCapabilities(assignments,tenantId);
    const memberships=await tx.projectMembership.findMany({where:{tenantId,userId:user.id,status:'ACTIVE'}});
    const scoped=memberships.filter(m=>this.resolver.resolveEffectiveCapabilities(assignments,tenantId,m.projectId).has('projects.read')).map(m=>m.projectId);
    return {user,tenantCaps,assignments,scoped};
  }
  private caps(actor:Awaited<ReturnType<ProjectsService['actor']>>,tenantId:string,id:string){
    return actor.tenantCaps.has('projects.read')?this.resolver.resolveEffectiveCapabilities(actor.assignments,tenantId,id):actor.scoped.includes(id)?this.resolver.resolveEffectiveCapabilities(actor.assignments,tenantId,id):new Set<string>();
  }
  private async view(tx:Prisma.TransactionClient,tenantId:string,id:string,actor:Awaited<ReturnType<ProjectsService['actor']>>){
    const caps=this.caps(actor,tenantId,id);if(!caps.has('projects.read'))throw new NotFoundException('Project not found.');
    await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${id} FOR SHARE`;
    const row=await tx.project.findFirst({where:{tenantId,id}});if(!row)throw new NotFoundException('Project not found.');
    const version=(await tx.$queryRaw<any[]>`SELECT (extract(epoch FROM updated_at)*1000000)::bigint::text AS version FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${id}`)[0].version;
    return {...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),version:`"p${id}:${version}"`,actions:{update:row.status!=='ARCHIVED'&&caps.has('projects.update'),suspend:row.status==='ACTIVE'&&caps.has('projects.update'),reactivate:row.status==='SUSPENDED'&&caps.has('projects.update'),archive:row.status!=='ARCHIVED'&&caps.has('projects.archive')}};
  }
  async searchAccess(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,projectId:string,scope='saved-searches',capability='logs.search'){
    const actor=await this.actor(tx,p,tenantId,false,scope);
    const caps=this.caps(actor,tenantId,projectId);
    if(!caps.has(capability as any))throw new NotFoundException('Project not found.');
    await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${projectId} FOR SHARE`;
    const project=await tx.project.findFirst({where:{tenantId,id:projectId,status:'ACTIVE'}});
    if(!project)throw new NotFoundException('Project not found.');
    return {actor,project,caps};
  }
  async quotaAccess(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,projectId:string,write:boolean){
    const actor=await this.actor(tx,p,tenantId,false,write?'quotas.manage':'quotas.read');
    const caps=this.caps(actor,tenantId,projectId);if(!caps.has('projects.read'))throw new NotFoundException('Project not found.');
    this.resolver.assertHasCapability(caps as any,write?'quotas.manage':'quotas.read');
    await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${projectId} FOR SHARE`;
    const project=await tx.project.findFirst({where:{tenantId,id:projectId}});if(!project)throw new NotFoundException('Project not found.');
    return {actor,project,caps};
  }
  async retentionAccess(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,projectId:string,write:boolean){
    const actor=await this.actor(tx,p,tenantId,false,write?'retention.manage':'retention.read');
    const caps=this.caps(actor,tenantId,projectId);if(!caps.has('projects.read'))throw new NotFoundException('Project not found.');
    this.resolver.assertHasCapability(caps as any,write?'retention.manage':'retention.read');
    await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${projectId} FOR SHARE`;
    const project=await tx.project.findFirst({where:{tenantId,id:projectId}});if(!project)throw new NotFoundException('Project not found.');
    return {actor,project,caps};
  }
  async credentialAccess(tx:Prisma.TransactionClient,p:TrustedPrincipal,tenantId:string,projectId:string,operation:'read'|'create'|'rotate'|'revoke',active=false){
    const actor=await this.actor(tx,p,tenantId,false,'credentials.'+operation);
    const caps=this.caps(actor,tenantId,projectId);if(!caps.has('projects.read'))throw new NotFoundException('Project not found.');
    this.resolver.assertHasCapability(caps as any,('ingestion.credentials.'+operation) as any);
    await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${projectId} FOR SHARE`;
    const project=await tx.project.findFirst({where:{tenantId,id:projectId}});if(!project)throw new NotFoundException('Project not found.');
    if(active&&project.status!=='ACTIVE')throw new ConflictException('Credential issuance requires an active project.');
    return {actor,project,caps};
  }
  list(p:TrustedPrincipal,tenantId:string,query:Record<string,unknown>){const q=projectQuery(query);return this.db.$transaction(async tx=>{
    const a=await this.actor(tx,p,tenantId);if(!a.tenantCaps.has('projects.read')&&!a.scoped.length)throw new ForbiddenException('Project access denied.');
    const where:Prisma.ProjectWhereInput={tenantId,...(!a.tenantCaps.has('projects.read')?{id:{in:a.scoped}}:{}),...(q.status?{status:q.status as any}:{}),...(q.search?{OR:[{name:{contains:q.search,mode:'insensitive'}},{id:{contains:q.search,mode:'insensitive'}}]}:{})};
    const fingerprint=JSON.stringify([tenantId,a.user.id,q.search,q.status,q.sort,q.direction,q.limit]);let cursor:string|undefined;
    if(q.cursor){try{const decoded=JSON.parse(Buffer.from(q.cursor,'base64url').toString());if(decoded.filter!==fingerprint||typeof decoded.id!=='string'||decoded.id.length>64)throw Error();cursor=decoded.id;}catch{throw new BadRequestException('Invalid project cursor.');}if(!await tx.project.findFirst({where:{AND:[where,{id:cursor}]}}))throw new BadRequestException('Expired project cursor; reload.');}
    const rows=await tx.project.findMany({where,orderBy:q.sort==='id'?[{id:q.direction}]:[{[q.sort]:q.direction},{id:q.direction}],take:q.limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    const items=[];for(const row of rows.slice(0,q.limit))items.push(await this.view(tx,tenantId,row.id,a));
    return {items,nextCursor:rows.length>q.limit?Buffer.from(JSON.stringify({id:items.at(-1)!.id,filter:fingerprint})).toString('base64url'):null,canCreate:a.tenantCaps.has('projects.create')};
  },{timeout:15000});}
  read(p:TrustedPrincipal,tenantId:string,id:string){return this.db.$transaction(async tx=>{const a=await this.actor(tx,p,tenantId);await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${id} FOR SHARE`;return this.view(tx,tenantId,id,a);});}
  async create(p:TrustedPrincipal,tenantId:string,body:unknown,correlationId:string){const input=projectInput(body,true),id=input.id??`project-${randomUUID()}`;
    try{return await this.db.$transaction(async tx=>{const a=await this.actor(tx,p,tenantId,true);this.resolver.assertHasCapability(a.tenantCaps,'projects.create');
      await tx.project.create({data:{id,tenantId,name:input.name!,status:'ACTIVE'}});
      const after=await this.view(tx,tenantId,id,a);await this.audit(tx,a,tenantId,id,'PROJECT_CREATED',null,after,correlationId);return after;
    });}catch(error){if((error as any).code==='P2002')throw new ConflictException('Project identifier is unavailable. Choose another code.');throw error;}
  }
  update(p:TrustedPrincipal,tenantId:string,id:string,body:unknown,etag:string|undefined,correlationId:string){const input=projectInput(body);
    if(!etag)throw new HttpException('If-Match is required.',428);const match=/^"p([^":]{1,64}):([0-9]{1,19})"$/.exec(etag);
    if(!match||BigInt(match[2]!)>9223372036854775807n)throw new BadRequestException('Invalid project precondition.');if(match[1]!==id)throw new ConflictException('Project context changed.');
    return this.db.$transaction(async tx=>{const a=await this.actor(tx,p,tenantId,true);await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${tenantId}::uuid AND id=${id} FOR UPDATE`;
      const before=await this.view(tx,tenantId,id,a),caps=this.caps(a,tenantId,id);this.resolver.assertHasCapability(caps as any,input.status==='ARCHIVED'?'projects.archive':'projects.update');
      if(before.version!==etag)throw new ConflictException('Project changed; reload before retrying.');if(before.status==='ARCHIVED')throw new ConflictException('Archived projects are read-only.');
      if(input.status&&!(before.status==='ACTIVE'&&['SUSPENDED','ARCHIVED'].includes(input.status)||before.status==='SUSPENDED'&&['ACTIVE','ARCHIVED'].includes(input.status)))throw new ConflictException('Unsupported project transition.');
      const changed=await tx.$executeRaw`UPDATE projects SET name=${input.name??before.name},status=${input.status??before.status}::"ProjectStatus",updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=${id} AND tenant_id=${tenantId}::uuid AND (extract(epoch FROM updated_at)*1000000)::bigint=${BigInt(match[2]!)}`;
      if(changed!==1)throw new ConflictException('Project changed.');const after=await this.view(tx,tenantId,id,a);
      await this.audit(tx,a,tenantId,id,input.status?(input.status==='ACTIVE'?'PROJECT_REACTIVATED':input.status==='ARCHIVED'?'PROJECT_ARCHIVED':'PROJECT_DISABLED'):'PROJECT_UPDATED',before,after,correlationId);return after;
    },{timeout:10000});
  }
  private audit(tx:Prisma.TransactionClient,a:Awaited<ReturnType<ProjectsService['actor']>>,tenantId:string,id:string,action:any,before:any,after:any,correlationId:string){return new PrismaAuditRepository(this.config).recordAuditEvent({tenantId,actorUserId:a.user.id,actorEmail:a.user.email,action,targetType:'project',targetId:id,details:{before:before?{name:before.name,status:before.status}:null,after:{name:after.name,status:after.status},correlationId,outcome:'SUCCESS'}},tx);}
}
