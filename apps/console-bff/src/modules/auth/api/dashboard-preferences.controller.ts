import {Controller,Get,Put,Post,HttpCode,Req,Res,Param,Body,UseGuards,BadRequestException,BadGatewayException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {BffConfigService} from '../../../config/bff-config.service.js';import {AdminClientService} from '../application/admin-client.service.js';import {preferenceSettings} from './dashboard-preference-settings.js';
@Controller('bff/projects/:projectId/dashboard-preferences')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class DashboardPreferencesController {
 constructor(private readonly config:BffConfigService,private readonly admin:AdminClientService){}
 private async forward(r:FastifyRequest,s:FastifyReply,p:string,method:'GET'|'PUT'|'POST',body?:unknown){
 if(!this.config.advancedAnalyticsEnabled)throw new ServiceUnavailableException('Advanced Analytics is not activated.');
 if(Object.keys(r.query as object??{}).length)throw new BadRequestException('Unsupported dashboard preference query.');
 const session=r.session!,tenant=session.activeTenantId;if(!tenant)throw new ForbiddenException('Select an authorized organization.');
 if(method==='PUT')body=preferenceSettings(body);if(method==='POST'&&body&&Object.keys(body as object).length)throw new BadRequestException('Reset accepts no settings.');
 const result=await this.admin.requestDashboardPreferences(session.user.id,tenant,p,method,body,r.headers['if-match'] as string|undefined),d:any=result.data;
 if(!d||d.projectId!==p||!/^"p(?:0|[1-9]\d{0,15})"$/.test(d.version)||typeof d.persisted!=='boolean'||!(d.updatedAt===null||typeof d.updatedAt==='string'&&Number.isFinite(Date.parse(d.updatedAt))))throw new BadGatewayException('Invalid dashboard preference response.');
 const settings=preferenceSettings(d.settings);s.header('Cache-Control','no-store').header('Pragma','no-cache').header('ETag',d.version);return {projectId:p,settings,version:d.version,persisted:d.persisted,updatedAt:d.updatedAt};
 }
 @Get()read(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('projectId')p:string){return this.forward(r,s,p,'GET');}
 @Put()save(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('projectId')p:string,@Body()b:unknown){return this.forward(r,s,p,'PUT',b);}
 @Post('reset') @HttpCode(200) reset(@Req()r:FastifyRequest,@Res({passthrough:true})s:FastifyReply,@Param('projectId')p:string,@Body()b:unknown){return this.forward(r,s,p,'POST',b);}
}
