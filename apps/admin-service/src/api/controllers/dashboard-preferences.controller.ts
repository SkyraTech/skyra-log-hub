import {Controller,Get,Put,Post,HttpCode,Req,Res,Param,Body,UseGuards,HttpException,ServiceUnavailableException,BadRequestException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';
import {TrustedAssertionGuard} from '../../core/security/trusted-assertion.guard.js';import {AdminConfigService} from '../../core/config/admin-config.service.js';import {DashboardPreferencesService} from '../../modules/dashboard-preferences/dashboard-preferences.service.js';
@Controller('admin/v1/tenants/:tenantId/projects/:projectId/dashboard-preferences')
@UseGuards(TrustedAssertionGuard)
export class DashboardPreferencesController {
 constructor(private readonly config:AdminConfigService,private readonly service:DashboardPreferencesService){}
 private async run(r:FastifyRequest,s:FastifyReply,t:string,p:string,method:'GET'|'PUT'|'RESET',body?:unknown){
 if(!this.config.dashboardPreferencesEnabled||!this.config.persistenceEnabled||!this.config.internalJwtConfigured)throw new ServiceUnavailableException('Dashboard preferences are not activated.');
 if(Object.keys(r.query as object??{}).length)throw new BadRequestException('Unexpected preference query.');s.header('Cache-Control','no-store');
 try{const result=await this.service.execute(r.principal!,t,p,method,body,r.headers['if-match'] as string|undefined);s.header('ETag',result.version);return result;}catch(e){if(e instanceof HttpException)throw e;throw new ServiceUnavailableException('Dashboard preferences unavailable. Retry manually.');}
 }
 @Get()read(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string){return this.run(r,s,t,p,'GET');}
 @Put()save(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Body()b:unknown){return this.run(r,s,t,p,'PUT',b);}
 @Post('reset') @HttpCode(200) reset(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('tenantId')t:string,@Param('projectId')p:string,@Body()b:unknown){if(b&&Object.keys(b as object).length)throw new BadRequestException('Reset accepts no settings.');return this.run(r,s,t,p,'RESET');}
}
