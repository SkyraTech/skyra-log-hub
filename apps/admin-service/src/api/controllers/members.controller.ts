import {Controller,Get,Patch,Param,Query,Body,Req,Res,UseGuards,ServiceUnavailableException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';
import {AdminConfigService} from '../../core/config/admin-config.service.js';
import {MembersManagementService} from '../../modules/membership/members-management.service.js';
@Controller('admin/v1/tenants/:tenantId/memberships')
@UseGuards(TrustedAssertionGuard)
export class MembersController {
  constructor(private readonly service:MembersManagementService,private readonly config:AdminConfigService){}
  private enabled(reply:FastifyReply){if(!this.config.persistenceEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Authoritative membership management is not activated.');reply.header('Cache-Control','no-store');}
  @Get()list(@Param('tenantId')tenant:string,@Query()query:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);return this.service.list(req.principal!,tenant,query);}
  @Get(':id')async read(@Param('tenantId')tenant:string,@Param('id')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const result=await this.service.read(req.principal!,tenant,id);reply.header('ETag',result.version);return result;}
  @Patch(':id')async update(@Param('tenantId')tenant:string,@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const input=req.headers['x-correlation-id'],correlation=typeof input==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(input)?input:randomUUID();const result=await this.service.update(req.principal!,tenant,id,body,req.headers['if-match'] as string|undefined,correlation);reply.header('ETag',result.version).header('X-Correlation-ID',correlation);return result;}
}
