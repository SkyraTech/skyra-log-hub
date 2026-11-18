import {Controller,Get,Param,Query,Req,Res,UseGuards} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';import {randomUUID} from 'node:crypto';
import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';import {AuditHistoryService} from '../../core/audit/application/audit-history.service.js';
import {ServiceUnavailableException} from '@nestjs/common';
@Controller('admin/v1/tenants/:tenantId/audit-events')
@UseGuards(TrustedAssertionGuard)
export class AuditHistoryController {
  constructor(private readonly history:AuditHistoryService){}
  private async safe<T>(req:FastifyRequest,reply:FastifyReply,run:()=>Promise<T>){
    const raw=req.headers['x-correlation-id'],id=typeof raw==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(raw)?raw:randomUUID();
    reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('X-Correlation-ID',id);
    try{return await run();}catch(e){if(String((e as any)?.name).startsWith('Prisma'))throw new ServiceUnavailableException('Audit history is unavailable. Retry later.');throw e;}
  }
  @Get('access')access(@Param('tenantId')tenant:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.safe(req,reply,()=>this.history.access(req.principal!,tenant));}
  @Get()list(@Param('tenantId')tenant:string,@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.safe(req,reply,()=>this.history.list(req.principal!,tenant,q));}
  @Get(':eventId')read(@Param('tenantId')tenant:string,@Param('eventId')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.safe(req,reply,()=>this.history.read(req.principal!,tenant,id));}
}
