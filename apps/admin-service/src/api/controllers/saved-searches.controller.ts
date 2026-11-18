import {Controller,Get,Post,Put,Delete,Param,Query,Body,Req,Res,UseGuards,ServiceUnavailableException,HttpException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';import {AdminConfigService} from '../../core/config/admin-config.service.js';import {SavedSearchesService} from '../../modules/saved-searches/saved-searches.service.js';
@Controller('admin/v1/tenants/:tenantId/projects/:projectId/saved-searches')
@UseGuards(TrustedAssertionGuard)
export class SavedSearchesController {
 constructor(private readonly service:SavedSearchesService,private readonly config:AdminConfigService){}
 private async safe<T>(reply:FastifyReply,run:()=>Promise<T>){reply.header('Cache-Control','no-store');if(!this.config.savedSearchesEnabled||!this.config.persistenceEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Saved searches are not activated.');try{return await run();}catch(e){if(e instanceof HttpException)throw e;throw new ServiceUnavailableException('Saved search storage unavailable. Retry safely.');}}
 @Get()list(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Query()q:Record<string,unknown>){return this.safe(s,()=>this.service.list(r.principal!,t,p,q));}
 @Get(':id')read(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Param('id')id:string){return this.safe(s,()=>this.service.read(r.principal!,t,p,id));}
 @Post()create(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Body()b:unknown){return this.safe(s,()=>this.service.create(r.principal!,t,p,b));}
 @Put(':id')update(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Param('id')id:string,@Body()b:unknown){return this.safe(s,()=>this.service.update(r.principal!,t,p,id,b,r.headers['if-match'] as string|undefined));}
 @Delete(':id')remove(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Param('id')id:string){return this.safe(s,()=>this.service.remove(r.principal!,t,p,id,r.headers['if-match'] as string|undefined));}
}
