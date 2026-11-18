import {Controller,Post,HttpCode,Body,Req,Res,UseGuards,BadGatewayException,HttpException,ServiceUnavailableException,ForbiddenException} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {SessionAuthGuard} from '../../auth/guards/session-auth.guard.js';
import {CsrfGuard} from '../../auth/guards/csrf.guard.js';
import {QueryTokenService} from '../../auth/application/query-token.service.js';
import {BffConfigService} from '../../../config/bff-config.service.js';
import {dashboardInput} from './dashboard-validation.js';
import {validateAggregateRequest} from './aggregate-validation.js';
export function dashboardFiltersMatch(a:Record<string,unknown>,b:Record<string,unknown>){const fingerprint=(d:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,Array.isArray(v)?[...v].sort():v])));return fingerprint(a)===fingerprint(b);}
export function publicDashboard(d:any,tenant:string,project:string){
 const invalid=():never=>{throw new BadGatewayException('Invalid dashboard response.');};
 if(d?.schemaVersion!==1||d.scope?.tenant_id!==tenant||d.scope?.searched_projects?.length!==1||d.scope.searched_projects[0]!==project||!['1m','5m','15m','1h','6h','1d'].includes(d.interval)||typeof d.generatedAt!=='string'||!Number.isFinite(Date.parse(d.generatedAt)))invalid();
 for(const period of [d.current,d.previous]){
  if(!period||!['COMPLETE','PARTIAL','UNAVAILABLE'].includes(period.completeness)||!period.statistics||!period.range||!Number.isFinite(Date.parse(period.range.start))||!Number.isFinite(Date.parse(period.range.end)))invalid();
  if((period.completeness==='UNAVAILABLE')!==(period.metrics===null)||period.completeness==='COMPLETE'&&(period.statistics.partial_results===true||Number(period.statistics.unavailable_segments??0)>0))invalid();
  if(period.metrics!==null&&(!period.metrics||!['total','errors','warnings','services'].every(k=>Number.isSafeInteger(period.metrics[k])&&period.metrics[k]>=0)||!Number.isFinite(period.metrics.errorRate)||period.metrics.errorRate<0||period.metrics.errorRate>100))invalid();
 }
 if(!d.serviceTrends||!Number.isInteger(d.serviceTrends.topN)||d.serviceTrends.topN<1||d.serviceTrends.topN>10||!Array.isArray(d.serviceTrends.services)||d.serviceTrends.services.length>10||d.serviceTrends.services.some((s:any)=>typeof s.service!=='string'||s.service.length>64||!Array.isArray(s.buckets)||s.buckets.length>240||s.buckets.some((b:any)=>!Number.isFinite(Date.parse(b.timestamp))||!['count','errors','warnings'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0))))invalid();
 if(!d.comparison||typeof d.comparison.complete!=='boolean'||d.comparison.complete&&[d.current,d.previous].some(p=>p.completeness!=='COMPLETE'))invalid();
 const number=(v:any)=>{if(typeof v!=='number'||!Number.isFinite(v))invalid();return v as number;};
 const count=(v:any)=>{if(!Number.isSafeInteger(v)||v<0)invalid();return v as number;};
 const metrics=(m:any)=>m===null?null:{total:count(m.total),errors:count(m.errors),warnings:count(m.warnings),services:count(m.services),errorRate:number(m.errorRate)};
 const period=(p:any)=>{const aggregations:Record<string,any>={};for(const name of ['volume_over_time','error_over_time','warning_over_time','severity_distribution','top_services','environment_distribution','active_services_count']){
   const a=p.aggregations?.[name];if(!a)continue;
   if(name==='active_services_count'){if(a.type!=='cardinality')invalid();aggregations[name]={type:'cardinality',value:count(a.value)};continue;}
   const histogram=name.endsWith('_over_time');if(a.type!==(histogram?'date_histogram':'terms')||!Array.isArray(a.buckets)||a.buckets.length>(histogram?240:10))invalid();
   aggregations[name]={type:a.type,buckets:a.buckets.map((b:any)=>{if(histogram){if(typeof b.timestamp!=='string'||!Number.isFinite(Date.parse(b.timestamp)))invalid();return {timestamp:b.timestamp,count:count(b.count)};}if(typeof b.key!=='string'||b.key.length>64)invalid();return {key:b.key,count:count(b.count)};})};
  }
  return {completeness:p.completeness,metrics:metrics(p.metrics),range:{start:p.range.start,end:p.range.end,timezone:'UTC'},statistics:{partial_results:p.statistics.partial_results===true,unavailable_segments:count(p.statistics.unavailable_segments??0),scanned_segments:count(p.statistics.scanned_segments),scanned_bytes:count(p.statistics.scanned_bytes),execution_time_ms:number(p.statistics.execution_time_ms),archive_watermark:typeof p.statistics.archive_watermark==='string'&&Number.isFinite(Date.parse(p.statistics.archive_watermark))?p.statistics.archive_watermark:undefined},aggregations};
 };
 const changes:Record<string,any>={};if(d.comparison.complete){if(!d.comparison.changes)invalid();for(const name of ['total','errors','warnings','services']){const c=d.comparison.changes[name];if(!c||!['NEW','NONE','EXISTING'].includes(c.activity))invalid();changes[name]={current:count(c.current),previous:count(c.previous),absolute:number(c.absolute),percent:c.percent===null?null:number(c.percent),activity:c.activity};}const c=d.comparison.changes.errorRate;if(!c)invalid();changes.errorRate={current:number(c.current),previous:number(c.previous),percentagePoints:number(c.percentagePoints)};}
 const filters:Record<string,unknown>={};for(const key of ['services','environments','levels'])if(d.filters?.[key]!==undefined){if(!Array.isArray(d.filters[key])||d.filters[key].length>20||d.filters[key].some((v:any)=>typeof v!=='string'||v.length>64))invalid();filters[key]=d.filters[key];}if(d.filters?.correlation_id!==undefined){if(typeof d.filters.correlation_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(d.filters.correlation_id))invalid();filters.correlation_id=d.filters.correlation_id;}
 return {schemaVersion:1,scope:{tenant_id:tenant,searched_projects:[project]},filters,interval:d.interval,intervalMs:count(d.intervalMs),generatedAt:d.generatedAt,current:period(d.current),previous:period(d.previous),comparison:{complete:d.comparison.complete,changes:d.comparison.complete?changes:null},serviceTrends:{...(d.serviceTrends.statistics?{statistics:{execution_time_ms:number(d.serviceTrends.statistics.execution_time_ms),scanned_bytes:count(d.serviceTrends.statistics.scanned_bytes),scanned_segments:count(d.serviceTrends.statistics.scanned_segments),unavailable_segments:count(d.serviceTrends.statistics.unavailable_segments??0),partial_results:d.serviceTrends.statistics.partial_results===true}}:{}),complete:d.serviceTrends.complete===true,topN:count(d.serviceTrends.topN),isTopN:d.serviceTrends.isTopN===true,services:d.serviceTrends.services.map((v:any)=>({service:v.service,count:count(v.count),buckets:v.buckets.map((b:any)=>({service:v.service,timestamp:b.timestamp,count:count(b.count),errors:count(b.errors),warnings:count(b.warnings),errorRate:number(b.errorRate)}))}))},limits:{maxServices:10,maxBuckets:240,maxRangeDays:7,maxResponseBytes:1048576},consistency:'bounded-independent-archive-evaluations'};
}
@Controller('bff/query')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class DashboardProxyController {
 private readonly active=new Set<AbortController>();
 private readonly latest=new Map<string,AbortController>();
 constructor(private readonly config:BffConfigService,private readonly tokens:QueryTokenService,private readonly auth:SessionAuthGuard){}
 @Post('dashboard') @HttpCode(200)
 async dashboard(@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply,@Body()body:unknown){
 if(!this.config.advancedAnalyticsEnabled)throw new ServiceUnavailableException('Advanced Analytics is not activated.');
 const input=dashboardInput(body,validateAggregateRequest);const d=body as any,tenant=req.session!.activeTenantId,project=d.projects[0];if(!tenant)throw new ForbiddenException('Select an authorized organization.');
 const token=this.tokens.createScopedQueryToken(req.session!,tenant,project),key=req.session!.sessionId;
 this.latest.get(key)?.abort();if(this.active.size>=4)throw new HttpException('Dashboard capacity reached. Retry later.',429);
 const controller=new AbortController();this.latest.set(key,controller);this.active.add(controller);const abort=()=>controller.abort(),timer=setTimeout(abort,15000);reply.raw.once('close',abort);
 try{
  const response=await fetch(this.config.queryServiceUrl+'/query/v1/logs/dashboard',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw new HttpException('Dashboard query failed. Retry manually.',[400,401,403,413,422,429,504].includes(response.status)?response.status:503);}
  const reader=response.body!.getReader(),parts:Uint8Array[]=[];let bytes=0;try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576)throw new BadGatewayException('Dashboard response exceeds limit.');parts.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
  const result=publicDashboard(JSON.parse(Buffer.concat(parts).toString('utf8')),tenant,project);
  if(!dashboardFiltersMatch(result.filters,input.filters)||result.interval!==input.interval||result.serviceTrends.topN!==input.top||Date.parse(result.current.range.start)!==Date.parse(input.base.time_range.start)||Date.parse(result.current.range.end)!==Date.parse(input.base.time_range.end))throw new BadGatewayException('Dashboard response does not match the requested filters.');
  await this.auth.authenticate(req);this.tokens.createScopedQueryToken(req.session!,tenant,project);if(controller.signal.aborted)throw new HttpException('Dashboard query timed out.',504);
  reply.header('Cache-Control','no-store').header('Pragma','no-cache');return result;
 }catch(e){if(e instanceof HttpException||e&&typeof e==='object'&&'statusCode' in e)throw e;throw new HttpException(controller.signal.aborted?'Dashboard query interrupted.':'Dashboard service unavailable.',controller.signal.aborted?504:503);}
 finally{clearTimeout(timer);reply.raw.removeListener('close',abort);this.active.delete(controller);if(this.latest.get(key)===controller)this.latest.delete(key);}
 }
}
