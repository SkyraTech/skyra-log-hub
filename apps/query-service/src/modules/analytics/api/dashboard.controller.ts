import {Controller,Post,Body,Req,Res,UseGuards,HttpCode,ServiceUnavailableException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {QueryAuthGuard} from '../../../common/guards/query-auth.guard.js';
import {CurrentPrincipal} from '../../../common/decorators/current-principal.decorator.js';
import type {QueryPrincipal} from '../../auth/domain/principal.model.js';
import {DashboardUseCase} from '../application/dashboard.use-case.js';
@Controller('query/v1/logs')
@UseGuards(QueryAuthGuard)
export class DashboardController {
 constructor(private readonly dashboard:DashboardUseCase){}
 @Post('dashboard') @HttpCode(200)
 async query(@CurrentPrincipal()principal:QueryPrincipal,@Body()body:unknown,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){
 const controller=new AbortController(),abort=()=>controller.abort();reply.raw.once('close',abort);const timer=setTimeout(abort,14000);
 try{const result=await this.dashboard.execute(principal,body,controller.signal);if(Buffer.byteLength(JSON.stringify(result))>1048576)throw new ServiceUnavailableException('Dashboard response limit reached. Narrow the range.');reply.header('Cache-Control','no-store');return result;}finally{clearTimeout(timer);reply.raw.removeListener('close',abort);}
 }
}
