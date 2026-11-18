import {Controller,Get,Patch,Param,Query,Body,Req,Res,UseGuards,ServiceUnavailableException,BadRequestException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';
import {AdminConfigService} from '../../core/config/admin-config.service.js';
import {QuotasService} from '../../modules/projects/quotas.service.js';
@Controller('admin/v1/tenants/:tenantId/projects/:projectId')
@UseGuards(TrustedAssertionGuard)
export class QuotasController {
  constructor(private readonly service:QuotasService,private readonly config:AdminConfigService){}
  private async safe<T>(reply:FastifyReply,run:()=>Promise<T>){
    reply.header('Cache-Control','no-store');
    if(!this.config.quotaUsageEnabled||!this.config.persistenceEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Quota management is not activated.');
    try{return await run();}catch(e){if(String((e as any)?.name).startsWith('Prisma'))throw new ServiceUnavailableException('Usage storage unavailable; retry later.');throw e;}
  }
  @Get('usage/history')history(@Param('tenantId')tenant:string,@Param('projectId')project:string,@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){if(!this.config.advancedAuditUsageEnabled)throw new ServiceUnavailableException('Advanced Usage is not activated.');return this.safe(reply,()=>this.service.history(req.principal!,tenant,project,q));}
  @Get('usage')usage(@Param('tenantId')tenant:string,@Param('projectId')project:string,@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){
    if(Object.keys(q).some(k=>k!=='period')||q.period!==undefined&&typeof q.period!=='string')throw new BadRequestException('Unsupported usage query.');
    return this.safe(reply,()=>this.service.read(req.principal!,tenant,project,q.period as string|undefined));
  }
  @Get('quota')async quota(@Param('tenantId')tenant:string,@Param('projectId')project:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){
    const result=await this.safe(reply,()=>this.service.read(req.principal!,tenant,project));reply.header('ETag',result.policy.version);return result.policy;
  }
  @Patch('quota')async update(@Param('tenantId')tenant:string,@Param('projectId')project:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){
    const result=await this.safe(reply,()=>this.service.update(req.principal!,tenant,project,body,req.headers['if-match'] as string|undefined,randomUUID()));reply.header('ETag',result.version);return result;
  }
}
