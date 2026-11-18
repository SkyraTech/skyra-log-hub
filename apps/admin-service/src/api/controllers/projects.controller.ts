import {Controller,Get,Post,Patch,Param,Query,Body,Req,Res,UseGuards,ServiceUnavailableException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';
import {AdminConfigService} from '../../core/config/admin-config.service.js';
import {ProjectsService} from '../../modules/projects/projects.service.js';
@Controller('admin/v1/tenants/:tenantId/projects')
@UseGuards(TrustedAssertionGuard)
export class ProjectsController {
  constructor(private readonly service:ProjectsService,private readonly config:AdminConfigService){}
  private enabled(reply:FastifyReply){if(!this.config.persistenceEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Project management is not activated.');reply.header('Cache-Control','no-store');}
  private correlation(req:FastifyRequest,reply:FastifyReply){const input=req.headers['x-correlation-id'],id=typeof input==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(input)?input:randomUUID();reply.header('X-Correlation-ID',id);return id;}
  @Get()async list(@Param('tenantId')tenant:string,@Query()query:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const result=await this.service.list(req.principal!,tenant,query);return query.page==='true'?result:result.items.map(({version,actions,...project})=>project);}
  @Get(':id')async read(@Param('tenantId')tenant:string,@Param('id')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const result=await this.service.read(req.principal!,tenant,id);reply.header('ETag',result.version);return result;}
  @Post()async create(@Param('tenantId')tenant:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const result=await this.service.create(req.principal!,tenant,body,this.correlation(req,reply));reply.header('ETag',result.version).header('Location',`/admin/v1/tenants/${tenant}/projects/${result.id}`);return result;}
  @Patch(':id')async update(@Param('tenantId')tenant:string,@Param('id')id:string,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){this.enabled(reply);const result=await this.service.update(req.principal!,tenant,id,body,req.headers['if-match'] as string|undefined,this.correlation(req,reply));reply.header('ETag',result.version);return result;}
}
