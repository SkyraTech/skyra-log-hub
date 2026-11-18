import {Controller,Get,Post,Patch,Param,Query,Body,Req,Res,UseGuards,ForbiddenException,BadGatewayException,BadRequestException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {AdminClientService} from '../application/admin-client.service.js';
export function publicProject(raw:unknown,tenant:string){
  const d=raw as Record<string,any>;
  if(!d||typeof d!=='object'||d.tenantId!==tenant||!['id','name','createdAt','updatedAt','version'].every(k=>typeof d[k]==='string')||!['ACTIVE','SUSPENDED','ARCHIVED'].includes(d.status)||!d.actions||!['update','suspend','reactivate','archive'].every(k=>typeof d.actions[k]==='boolean')||!/^"p[^":]{1,64}:\d+"$/.test(d.version)||!d.version.startsWith(`"p${d.id}:`))throw new BadGatewayException('Invalid project response.');
  return {id:d.id,tenantId:d.tenantId,name:d.name,status:d.status,createdAt:d.createdAt,updatedAt:d.updatedAt,version:d.version,actions:{update:d.actions.update,suspend:d.actions.suspend,reactivate:d.actions.reactivate,archive:d.actions.archive}};
}
@Controller('bff/projects')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class ProjectsController {
  constructor(private readonly admin:AdminClientService){}
  private async forward(req:FastifyRequest,reply:FastifyReply,method:'GET'|'POST'|'PATCH',id?:string,query:Record<string,unknown>={},body?:unknown){
    const s=req.session!,tenant=s.activeTenantId;if(!tenant||!s.memberships.some(m=>m.tenantId===tenant))throw new ForbiddenException('Select an authorized organization.');
    const params=new URLSearchParams({page:'true'});for(const [key,value]of Object.entries(query)){if(!['q','status','sort','direction','limit','cursor'].includes(key)||typeof value!=='string')throw new BadRequestException('Unsupported project filter.');params.set(key,value);}
    const input=req.headers['x-correlation-id'],correlation=typeof input==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(input)?input:randomUUID();reply.header('Cache-Control','no-store').header('X-Correlation-ID',correlation);
    const result=await this.admin.requestProjects(s.user.id,tenant,method,id,method==='GET'&&!id?params.toString():'',body,req.headers['if-match'] as string|undefined,correlation);
    if(method!=='GET'||id){const project=publicProject(result.data,tenant);if(id&&project.id!==id)throw new BadGatewayException('Invalid project response.');reply.header('ETag',project.version);return project;}
    const data=result.data as any;if(!data||!Array.isArray(data.items)||data.items.length>100||typeof data.canCreate!=='boolean'||!(data.nextCursor===null||typeof data.nextCursor==='string'))throw new BadGatewayException('Invalid project list.');
    return {items:data.items.map((d:unknown)=>publicProject(d,tenant)),nextCursor:data.nextCursor,canCreate:data.canCreate};
  }
  @Get()list(@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'GET',undefined,q);}
  @Get(':id')read(@Param('id')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'GET',id);}
  @Post()create(@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'POST',undefined,{},body);}
  @Patch(':id')update(@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,'PATCH',id,{},body);}
}
