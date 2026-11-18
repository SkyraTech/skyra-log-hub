import {Controller,Get,Post,HttpCode,Param,Query,Body,Req,Res,UseGuards,ForbiddenException,BadRequestException,BadGatewayException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';import {randomUUID} from 'node:crypto';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {AdminClientService} from '../application/admin-client.service.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function publicCredential(raw:unknown,tenantId:string,projectId:string,issuance=false){
  const d=raw as Record<string,any>;
  if(!d||typeof d!=='object'||typeof d.id!=='string'||!uuid.test(d.id)||d.tenantId!==tenantId||d.projectId!==projectId||!['keyPrefix','description','createdAt','expiresAt','updatedAt','version'].every(k=>typeof d[k]==='string')||!['ACTIVE','EXPIRED','REVOKED'].includes(d.status)||typeof d.isRevoked!=='boolean'||!Array.isArray(d.allowedProjects)||d.allowedProjects.length!==1||d.allowedProjects[0]!==projectId||!Array.isArray(d.allowedEnvironments)||!d.allowedEnvironments.every((v:unknown)=>typeof v==='string')||typeof d.rateLimitPerMin!=='number'||!d.actions||!['revoke','rotate'].every(k=>typeof d.actions[k]==='boolean')||!d.version.startsWith(`"c${d.id}:`)||!/^"c[a-f0-9-]{36}:\d+"$/i.test(d.version)||![d.rotatedFromId,d.replacementId,d.createdBy,d.issuanceRequestId].every(v=>v===null||typeof v==='string'&&uuid.test(v))||!(d.revokedAt===null||typeof d.revokedAt==='string'))throw new BadGatewayException('Invalid credential metadata response.');
  const metadata={id:d.id,tenantId:d.tenantId,projectId:d.projectId,createdBy:d.createdBy,issuanceRequestId:d.issuanceRequestId,keyPrefix:d.keyPrefix,description:d.description,allowedProjects:[projectId],allowedEnvironments:[...d.allowedEnvironments],rateLimitPerMin:d.rateLimitPerMin,createdAt:d.createdAt,expiresAt:d.expiresAt,updatedAt:d.updatedAt,isRevoked:d.isRevoked,revokedAt:d.revokedAt,rotatedFromId:d.rotatedFromId,replacementId:d.replacementId,status:d.status,version:d.version,actions:{revoke:d.actions.revoke,rotate:d.actions.rotate}};
  if(!issuance)return metadata;
  if(typeof d.rawToken!=='string'||!/^skyra_live_[a-f0-9]{64}$/.test(d.rawToken))throw new BadGatewayException('Invalid credential issuance response. Review metadata before retrying.');
  return {...metadata,rawToken:d.rawToken};
}
@Controller('bff/projects/:projectId/credentials')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class CredentialsController {
  constructor(private readonly admin:AdminClientService){}
  private async forward(req:FastifyRequest,reply:FastifyReply,project:string,operation:'read'|'create'|'rotate'|'revoke',id?:string,query:Record<string,unknown>={},body?:unknown){
    const session=req.session!,tenant=session.activeTenantId;if(!tenant||!session.memberships.some(m=>m.tenantId===tenant))throw new ForbiddenException('Select an authorized organization.');
    const params=new URLSearchParams();for(const [k,v]of Object.entries(query)){if(!['q','status','sort','direction','limit','cursor'].includes(k)||typeof v!=='string')throw new BadRequestException('Unsupported credential filter.');params.set(k,v);}
    const input=req.headers['x-correlation-id'],correlation=typeof input==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(input)?input:randomUUID();reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('Referrer-Policy','no-referrer').header('X-Correlation-ID',correlation);
    const result=await this.admin.requestCredentials(session.user.id,tenant,project,operation,id,params.toString(),body,req.headers['if-match'] as string|undefined,req.headers['idempotency-key'] as string|undefined,correlation);
    if(operation!=='read'||id){const metadata=publicCredential(result.data,tenant,project,operation==='create'||operation==='rotate');if(id&&operation!=='rotate'&&metadata.id!==id)throw new BadGatewayException('Invalid credential response.');reply.header('ETag',metadata.version);return metadata;}
    const d=result.data as any;if(!d||!Array.isArray(d.items)||d.items.length>100||typeof d.canCreate!=='boolean'||!(d.nextCursor===null||typeof d.nextCursor==='string')||!d.project||d.project.id!==project||typeof d.project.name!=='string'||!['ACTIVE','SUSPENDED','ARCHIVED'].includes(d.project.status))throw new BadGatewayException('Invalid credential list.');
    return {items:d.items.map((v:unknown)=>publicCredential(v,tenant,project)),nextCursor:d.nextCursor,canCreate:d.canCreate,project:{id:d.project.id,name:d.project.name,status:d.project.status}};
  }
  @Get()list(@Param('projectId')project:string,@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'read',undefined,q);}
  @Get(':id')read(@Param('projectId')project:string,@Param('id')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'read',id);}
  @Post()create(@Param('projectId')project:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'create',undefined,{},body);}
  @Post(':id/rotate')rotate(@Param('projectId')project:string,@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'rotate',id,{},body);}
  @Post(':id/revoke')@HttpCode(200)revoke(@Param('projectId')project:string,@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'revoke',id,{},body);}
}
