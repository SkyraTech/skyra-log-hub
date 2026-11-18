import {BffConfigService} from '../../../config/bff-config.service.js';
import {ServiceUnavailableException} from '@nestjs/common';
import {Controller,Get,Param,Query,Req,Res,UseGuards,BadRequestException,BadGatewayException,ForbiddenException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {AdminClientService} from '../application/admin-client.service.js';import {publicQuota} from './quotas.controller.js';
const date=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const decimal=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(v)&&BigInt(v)<=9007199254740991n;
export function historyFilters(q:Record<string,unknown>){
 if(Object.keys(q).length!==2||Object.keys(q).some(k=>!['start','end'].includes(k))||!date(q.start)||!date(q.end)||Date.parse(q.end)<=Date.parse(q.start)||Date.parse(q.end)-Date.parse(q.start)>90*86400000||Date.parse(q.end)>Math.floor(Date.now()/86400000)*86400000+86400000)throw new BadRequestException('Use UTC start/exclusive end dates for at most 90 days.');
 return {start:q.start,end:q.end};
}
export function publicUsageHistory(d:any,tenant:string,project:string,range:{start:string;end:string}){
 const fail=()=>{throw new BadGatewayException('Invalid usage history response.');};
 if(!d||d.schemaVersion!==1||d.tenantId!==tenant||d.projectId!==project||d.start!==range.start||d.end!==range.end||d.source!=='AUTHORITATIVE_ADMISSION_WINDOWS'||d.timeBasis!=='SERVER_UTC_ADMISSION_DAY'||d.historicalPolicy!=='UNAVAILABLE'||d.policyBasis!=='CURRENT_POLICY_REFERENCE'||typeof d.projectName!=='string'||d.projectName.length>255||!Array.isArray(d.days)||d.days.length!==(Date.parse(range.end)-Date.parse(range.start))/86400000||typeof d.measuredAt!=='string'||!Number.isFinite(Date.parse(d.measuredAt)))return fail();
 const policy=publicQuota(d.policy);
 const metric=(m:any,limit:string|null)=>{
  if(!m||!decimal(m.accepted)||!decimal(m.reserved)||m.historicalLimit!==null||m.utilization!==null||BigInt(m.accepted)+BigInt(m.reserved)>9007199254740991n)return fail();
  const used=BigInt(m.accepted)+BigInt(m.reserved),l=policy.enabled&&limit!==null?BigInt(limit):null;
  return {accepted:m.accepted,reserved:m.reserved,historicalLimit:null,utilization:null,currentPolicyReference:{limit:l?.toString()??null,utilization:l===null||l===0n&&used>0n?null:l===0n?0:Number(used*10000n/l)/100,capacity:l===null?'UNLIMITED':l===0n?'ZERO_LIMIT':used>=l?'EXHAUSTED':'AVAILABLE'}};
 };
 const days=d.days.map((v:any,i:number)=>{const period=new Date(Date.parse(range.start)+i*86400000).toISOString().slice(0,10);if(!v||v.period!==period||v.historicalQuotaExceeded!==null||typeof v.recordedWindow!=='boolean'||!(v.updatedAt===null||typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt))))return fail();const events=metric(v.events,policy.dailyEvents),bytes=metric(v.bytes,policy.dailyBytes),state=BigInt(events.reserved)>0n||BigInt(bytes.reserved)>0n?'RECONCILING':'COMPLETE';if(v.completeness!==state)return fail();return {period,events,bytes,completeness:state,historicalQuotaExceeded:null,recordedWindow:v.recordedWindow,updatedAt:v.updatedAt};});
 return {schemaVersion:1,projectId:project,projectName:d.projectName,start:range.start,end:range.end,days,policy,source:'AUTHORITATIVE_ADMISSION_WINDOWS',timeBasis:'SERVER_UTC_ADMISSION_DAY',historicalPolicy:'UNAVAILABLE',policyBasis:'CURRENT_POLICY_REFERENCE',measuredAt:d.measuredAt,limits:{maxDays:90},policyNote:'Historical quota policies were not snapshotted. Historical utilization and exceeded states are unknown. Reference percentages use the current policy and include pending reservations.'};
}
@Controller('bff/projects/:projectId/usage/history')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class UsageHistoryController {
 constructor(private readonly admin:AdminClientService,private readonly config:BffConfigService){}
 @Get()async history(@Param('projectId')project:string,@Query()raw:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){
  if(!this.config.advancedAuditUsageEnabled)throw new ServiceUnavailableException('Advanced Usage is not activated.');
  const tenant=req.session!.activeTenantId;if(!tenant)throw new ForbiddenException('Select an authorized organization.');const range=historyFilters(raw);reply.header('Cache-Control','no-store').header('Pragma','no-cache');
  const result=await this.admin.requestUsageHistory(req.session!.user.id,tenant,project,new URLSearchParams(range).toString());return publicUsageHistory(result.data,tenant,project,range);
 }
}
