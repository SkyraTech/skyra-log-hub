import {Controller,Get,Patch,Param,Query,Body,Req,Res,UseGuards,ForbiddenException,BadGatewayException,BadRequestException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';
import {CsrfGuard} from '../guards/csrf.guard.js';
import {AdminClientService} from '../application/admin-client.service.js';
const roles=['OrgOwner','OrgAdmin','ProjectAdmin','Developer','Viewer'],statuses=['ACTIVE','SUSPENDED','REVOKED','PENDING_INVITE'];
export function publicMember(raw:unknown){
  if(!raw||typeof raw!=='object')throw new BadGatewayException('Invalid member response.');const d=raw as Record<string,any>;
  if(!/^[0-9a-f-]{36}$/i.test(d.id)||!['displayName','email','identityStatus','createdAt','updatedAt'].every(k=>typeof d[k]==='string')||!statuses.includes(d.status)||!Array.isArray(d.roles)||!d.roles.every((r:unknown)=>roles.includes(String(r)))||!Array.isArray(d.projectRoles)||!d.projectRoles.every((r:any)=>roles.includes(r.role)&&typeof r.projectId==='string')||!/^"m[0-9a-f-]{36}:\d+"$/i.test(d.version)||!d.version.startsWith(`"m${d.id}:`)||!Array.isArray(d.permittedRoles)||!d.permittedRoles.every((r:unknown)=>roles.includes(String(r)))||!d.actions||!['changeRole','suspend','reactivate','revoke'].every(k=>typeof d.actions[k]==='boolean'))throw new BadGatewayException('Invalid member response.');
  return {id:d.id,displayName:d.displayName,email:d.email,identityStatus:d.identityStatus,status:d.status,roles:d.roles,projectRoles:d.projectRoles.map((r:any)=>({role:r.role,projectId:r.projectId})),scope:'organization',version:d.version,self:d.self===true,lastOwner:d.lastOwner===true,permittedRoles:d.permittedRoles,actions:{changeRole:d.actions.changeRole,suspend:d.actions.suspend,reactivate:d.actions.reactivate,revoke:d.actions.revoke},createdAt:d.createdAt,updatedAt:d.updatedAt};
}
@Controller('bff/organization/members')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class MembersController {
  constructor(private readonly admin:AdminClientService){}
  private async forward(req:FastifyRequest,reply:FastifyReply,method:'GET'|'PATCH',id?:string,query:Record<string,unknown>={},body?:unknown){
    const session=req.session!,tenant=session.activeTenantId;
    if(!tenant||!session.memberships.some(m=>m.tenantId===tenant))throw new ForbiddenException('Select an authorized organization.');
    const parameters=new URLSearchParams();for(const [key,value]of Object.entries(query)){if(!['q','status','role','limit','cursor'].includes(key)||typeof value!=='string')throw new BadRequestException('Unsupported member filter.');parameters.set(key,value);}
    const input=req.headers['x-correlation-id'],correlation=typeof input==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(input)?input:randomUUID();
    const result=await this.admin.requestMembers(session.user.id,tenant,method,id,parameters.toString(),body,req.headers['if-match'] as string|undefined,correlation);
    reply.header('Cache-Control','no-store').header('X-Correlation-ID',correlation);
    if(id){const member=publicMember(result.data);if(member.id!==id)throw new BadGatewayException('Invalid member response.');return member;}
    const data=result.data as Record<string,any>;
    if(!data||!Array.isArray(data.items)||data.items.length>100||!(data.nextCursor===null||typeof data.nextCursor==='string')||!Array.isArray(data.capabilities)||!Array.isArray(data.roles))throw new BadGatewayException('Invalid member list.');
    return {items:data.items.map(publicMember),nextCursor:data.nextCursor,capabilities:data.capabilities.filter((c:unknown)=>c==='tenant.members.read'||c==='tenant.members.manage'),roles:data.roles.filter((r:any)=>roles.includes(r.name)&&typeof r.description==='string'&&Array.isArray(r.capabilities)).map((r:any)=>({name:r.name,description:r.description,capabilities:r.capabilities.filter((v:unknown)=>typeof v==='string')}))};
  }
  @Get()list(@Query()query:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'GET',undefined,query);}
  @Get(':id')read(@Param('id')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'GET',id);}
  @Patch(':id')update(@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'PATCH',id,{},body);}
}
