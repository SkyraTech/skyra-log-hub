import {Controller,Get,Patch,Param,Query,Body,Req,Res,UseGuards,ForbiddenException,BadRequestException,BadGatewayException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';
import {CsrfGuard} from '../guards/csrf.guard.js';
import {AdminClientService} from '../application/admin-client.service.js';
const decimal=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(v)&&BigInt(v)<=9007199254740991n;
export function publicQuota(d:any){
  if(!d||typeof d.enabled!=='boolean'||typeof d.canManage!=='boolean'||!/^"q\d{1,16}"$/.test(d.version)||![d.dailyEvents,d.dailyBytes].every(v=>v===null||decimal(v)))throw new BadGatewayException('Invalid quota response.');
  return {enabled:d.enabled,canManage:d.canManage,version:d.version,dailyEvents:d.dailyEvents,dailyBytes:d.dailyBytes};
}
export function publicUsage(d:any,tenant:string,project:string){
  const metric=(m:any)=>{if(!m||![m.accepted,m.reserved].every(decimal)||![m.limit,m.remaining].every(v=>v===null||decimal(v))||!(m.utilization===null||typeof m.utilization==='number'&&Number.isFinite(m.utilization)&&m.utilization>=0&&m.utilization<=100))throw new BadGatewayException('Invalid usage metric.');return {accepted:m.accepted,reserved:m.reserved,limit:m.limit,remaining:m.remaining,utilization:m.utilization};};
  if(!d||d.tenantId!==tenant||d.projectId!==project||typeof d.projectName!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.period)||!['COMPLETE','RECONCILING'].includes(d.completeness)||![d.periodStart,d.periodEnd,d.measuredAt].every(v=>typeof v==='string'&&Number.isFinite(Date.parse(v)))||!(d.updatedAt===null||typeof d.updatedAt==='string'&&Number.isFinite(Date.parse(d.updatedAt))))throw new BadGatewayException('Invalid usage response.');
  return {projectId:project,projectName:d.projectName,period:d.period,periodStart:d.periodStart,periodEnd:d.periodEnd,policy:publicQuota(d.policy),events:metric(d.events),bytes:metric(d.bytes),completeness:d.completeness,updatedAt:d.updatedAt,measuredAt:d.measuredAt,byteDefinition:'UTF-8 JSON of normalized event arrays, including brackets and commas. Excludes HTTP envelope, WAL framing, archive and query bytes.'};
}
@Controller('bff/projects/:projectId')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class QuotasController {
  constructor(private readonly admin:AdminClientService){}
  private async forward(req:FastifyRequest,reply:FastifyReply,project:string,resource:'usage'|'quota',method:'GET'|'PATCH',q:Record<string,unknown>={},body?:unknown){
    const session=req.session!,tenant=session.activeTenantId;if(!tenant||!session.memberships.some(m=>m.tenantId===tenant))throw new ForbiddenException('Select an authorized organization.');
    if(Object.keys(q).some(k=>k!=='period')||q.period!==undefined&&(resource!=='usage'||typeof q.period!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(q.period)))throw new BadRequestException('Unsupported usage query.');
    reply.header('Cache-Control','no-store').header('Pragma','no-cache');
    const result=await this.admin.requestQuota(session.user.id,tenant,project,resource,method,q.period as string|undefined,body,req.headers['if-match'] as string|undefined);
    if(resource==='usage')return publicUsage(result.data,tenant,project);
    const policy=publicQuota(result.data);reply.header('ETag',policy.version);return policy;
  }
  @Get('usage')usage(@Param('projectId')project:string,@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'usage','GET',q);}
  @Get('quota')quota(@Param('projectId')project:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'quota','GET');}
  @Patch('quota')update(@Param('projectId')project:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,project,'quota','PATCH',{},body);}
}
