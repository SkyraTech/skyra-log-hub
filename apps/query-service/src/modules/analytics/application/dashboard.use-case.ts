import {Injectable,Inject} from '@nestjs/common';
import {AggregateLogsUseCase} from './aggregate-logs.use-case.js';
import {AggregateValidationPipe} from '../api/pipes/aggregate-validation.pipe.js';
import {dashboardInput} from '../api/dashboard-validation.js';
import {QueryPlannerService} from '../../query-execution/application/query-planner.service.js';
import {LOG_QUERY_EXECUTION_PORT,type ILogQueryExecutionPort} from '../../query-execution/domain/query-execution.port.js';
import type {QueryPrincipal} from '../../auth/domain/principal.model.js';
import type {AggregateResponseDto} from '../api/dto/aggregate-response.dto.js';
import {QueryTimeoutException} from '../../../common/errors/query.errors.js';
export function comparison(current:number,previous:number){return {current,previous,absolute:current-previous,percent:previous===0?null:(current-previous)/previous*100,activity:previous===0?(current===0?'NONE':'NEW'):'EXISTING'};}
export function periodMetrics(r:AggregateResponseDto){
 const partial=r.statistics.partial_results===true||Number(r.statistics.unavailable_segments??0)>0;
 const completeness=partial?(r.statistics.scanned_segments===0?'UNAVAILABLE':'PARTIAL'):'COMPLETE';
 const agg=r.aggregations.severity_distribution;
 const buckets=agg?.type==='terms'?agg.buckets:[];const count=(levels:string[])=>buckets.filter(b=>levels.includes(b.key)).reduce((n,b)=>n+b.count,0);
 const total=buckets.reduce((n,b)=>n+b.count,0),errors=count(['error','fatal']),warnings=count(['warn']),services=r.aggregations.active_services_count;
 return {completeness,metrics:completeness==='UNAVAILABLE'?null:{total,errors,warnings,errorRate:total?errors/total*100:0,services:services?.type==='cardinality'?services.value:0},range:r.query_range,statistics:r.statistics,aggregations:r.aggregations};
}
@Injectable()
export class DashboardUseCase {
 constructor(private readonly aggregate:AggregateLogsUseCase,private readonly planner:QueryPlannerService,@Inject(LOG_QUERY_EXECUTION_PORT)private readonly execution:ILogQueryExecutionPort){}
 async execute(principal:QueryPrincipal,raw:unknown,signal?:AbortSignal){
  const input=dashboardInput(raw,v=>new AggregateValidationPipe().transform(v)),start=Date.parse(input.base.time_range.start),end=Date.parse(input.base.time_range.end),began=Date.now();
  const check=()=>{if(signal?.aborted||Date.now()-began>14000)throw new QueryTimeoutException();};
  const main={...input.base,include_empty_buckets:true,aggregations:[{name:'volume_over_time',type:'date_histogram',field:'@timestamp',interval:input.interval},{name:'severity_distribution',type:'terms',field:'log.level',size:6},{name:'top_services',type:'terms',field:'service.name',size:input.top},{name:'environment_distribution',type:'terms',field:'environment',size:5},{name:'active_services_count',type:'cardinality',field:'service.name'}]} as any;
  check();const current=await this.aggregate.execute(principal,main,undefined,signal,true);check();
  const previous=await this.aggregate.execute(principal,{...main,time_range:{start:new Date(start-(end-start)).toISOString(),end:new Date(start).toISOString()},aggregations:main.aggregations.filter((a:any)=>['severity_distribution','active_services_count'].includes(a.name))},undefined,signal,true);check();
  const plan=await this.planner.planAggregation(principal,input.base);check();
  const trends=await this.execution.executeAggregation({...plan,deduplicateEvents:true,aggregations:[{name:'services',type:'service_trend',field:'service.name',interval:input.interval,size:input.top}]},signal);check();
  const now=periodMetrics(current),before=periodMetrics(previous),trend=trends.aggregations.services;
  let trendComplete=!plan.unavailableSegmentCount&&now.completeness==='COMPLETE';
  const ranked=current.aggregations.top_services,rows=trend?.type==='service_trend'?trend.buckets:[];
  const totals=rows.filter(r=>r.service==='').reduce((a,b)=>({total:a.total+b.count,errors:a.errors+b.errors,warnings:a.warnings+b.warnings}),{total:0,errors:0,warnings:0});
  if(now.metrics&&(totals.total!==now.metrics.total||totals.errors!==now.metrics.errors||totals.warnings!==now.metrics.warnings)){trendComplete=false;now.completeness='PARTIAL';current.statistics.partial_results=true;}
  const services=(ranked?.type==='terms'?ranked.buckets:[]).map(service=>{
   const actual=rows.filter(r=>r.service===service.key),byTime=new Map(actual.map(r=>[Date.parse(r.timestamp),r]));
   const buckets=[];if(trendComplete){for(let at=Math.floor(start/input.width)*input.width;at<end;at+=input.width)buckets.push(byTime.get(at)??{service:service.key,timestamp:new Date(at).toISOString(),count:0,errors:0,warnings:0});}else buckets.push(...actual);
   return {service:service.key,count:service.count,buckets:buckets.map(b=>({...b,errorRate:b.count?b.errors/b.count*100:0}))};
  });
  const global=rows.filter(r=>r.service===''),globalByTime=new Map(global.map(r=>[Date.parse(r.timestamp),r]));
  const aligned=[];if(trendComplete){for(let at=Math.floor(start/input.width)*input.width;at<end;at+=input.width)aligned.push(globalByTime.get(at)??{timestamp:new Date(at).toISOString(),errors:0,warnings:0});}else aligned.push(...global);
  current.aggregations.error_over_time={type:'date_histogram',buckets:aligned.map(b=>({timestamp:b.timestamp,count:b.errors}))};
  current.aggregations.warning_over_time={type:'date_histogram',buckets:aligned.map(b=>({timestamp:b.timestamp,count:b.warnings}))};
  const complete=now.completeness==='COMPLETE'&&before.completeness==='COMPLETE'&&trendComplete;
  const changes=complete&&now.metrics&&before.metrics?{total:comparison(now.metrics.total,before.metrics.total),errors:comparison(now.metrics.errors,before.metrics.errors),warnings:comparison(now.metrics.warnings,before.metrics.warnings),services:comparison(now.metrics.services,before.metrics.services),errorRate:{current:now.metrics.errorRate,previous:before.metrics.errorRate,percentagePoints:now.metrics.errorRate-before.metrics.errorRate}}:null;
  return {schemaVersion:1,scope:current.scope,filters:input.filters,interval:input.interval,intervalMs:input.width,generatedAt:new Date().toISOString(),current:now,previous:before,comparison:{complete,changes},serviceTrends:{statistics:{execution_time_ms:trends.executionTimeMs,scanned_bytes:trends.scannedBytes,scanned_segments:trends.scannedSegments,unavailable_segments:plan.unavailableSegmentCount??0,partial_results:!trendComplete},complete:trendComplete,topN:input.top,isTopN:!!now.metrics&&now.metrics.services>input.top,services},limits:{maxServices:10,maxBuckets:240,maxRangeDays:7,maxResponseBytes:1048576},consistency:'bounded-independent-archive-evaluations'};
 }
}
