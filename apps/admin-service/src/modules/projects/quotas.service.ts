import {Injectable,BadRequestException,ConflictException,HttpException} from '@nestjs/common';
import {usageHistoryRange,historyMetric} from './usage-history.js';
import {ForbiddenException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {AdminConfigService} from '../../core/config/admin-config.service.js';
import {adminPrisma} from '../../core/database/admin-prisma.js';
import type {TrustedPrincipal} from '../../core/security/trusted-assertion.guard.js';
import {ProjectsService} from './projects.service.js';
import {PrismaAuditRepository} from '../../core/audit/infrastructure/prisma-audit.repository.js';
export function quotaInput(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid quota policy.');
  const d=raw as Record<string,unknown>;
  if(Object.keys(d).length!==3||Object.keys(d).some(k=>!['enabled','dailyEvents','dailyBytes'].includes(k))||typeof d.enabled!=='boolean')throw new BadRequestException('Supply enabled, dailyEvents and dailyBytes.');
  for(const k of ['dailyEvents','dailyBytes'])if(d[k]!==null&&(typeof d[k]!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(d[k] as string)||BigInt(d[k] as string)>9007199254740991n))throw new BadRequestException('Limits must be null or nonnegative decimal strings up to 9007199254740991.');
  return {enabled:d.enabled,dailyEvents:d.dailyEvents as string|null,dailyBytes:d.dailyBytes as string|null};
}
@Injectable()
export class QuotasService {
  constructor(private readonly config:AdminConfigService,private readonly projects:ProjectsService){}
  private policy(row:any,canManage:boolean){return {enabled:row?.enabled??true,dailyEvents:row?.daily_events?.toString()??null,dailyBytes:row?.daily_bytes?.toString()??null,version:`"q${row?.version??0}"`,canManage};}
  read(p:TrustedPrincipal,tenant:string,project:string,period?:string){
    const day=period??new Date().toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new BadRequestException('Invalid UTC period.');
    return adminPrisma(this.config).$transaction(async tx=>{
      const access=await this.projects.quotaAccess(tx,p,tenant,project,false);
      const policy=(await tx.$queryRaw<any[]>`SELECT * FROM project_quotas WHERE tenant_id=${tenant}::uuid AND project_id=${project}`)[0];
      const row=(await tx.$queryRaw<any[]>`SELECT * FROM project_usage_windows WHERE tenant_id=${tenant}::uuid AND project_id=${project} AND period=${day}::date`)[0];
      const metric=(accepted:any,reserved:any,limit:any)=>{const a=BigInt(accepted??0),r=BigInt(reserved??0),l=policy?.enabled&&limit!==null&&limit!==undefined?BigInt(limit):null;
        return {accepted:a.toString(),reserved:r.toString(),limit:l?.toString()??null,remaining:l===null?null:(l>a+r?l-a-r:0n).toString(),utilization:l===null?null:l===0n?100:Math.min(100,Number((a+r)*10000n/l)/100)};};
      return {tenantId:tenant,projectId:project,projectName:access.project.name,period:day,periodStart:day+'T00:00:00.000Z',periodEnd:new Date(Date.parse(day)+86400000).toISOString(),
        policy:this.policy(policy,access.caps.has('quotas.manage')),events:metric(row?.accepted_events,row?.reserved_events,policy?.daily_events),bytes:metric(row?.accepted_bytes,row?.reserved_bytes,policy?.daily_bytes),
        completeness:BigInt(row?.reserved_events??0)>0n?'RECONCILING':'COMPLETE',updatedAt:row?.updated_at?.toISOString()??null,measuredAt:new Date().toISOString(),byteDefinition:'UTF-8 JSON of the normalized event array, including brackets and commas; excludes envelope, WAL framing, archive and query bytes.'};
    },{isolationLevel:'RepeatableRead'});
  }
  history(p:TrustedPrincipal,tenant:string,project:string,raw:Record<string,unknown>){
    const range=usageHistoryRange(raw);
    return adminPrisma(this.config).$transaction(async tx=>{
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
      const access=await this.projects.quotaAccess(tx,p,tenant,project,false);
      if(access.project.status!=='ACTIVE')throw new ForbiddenException('Historical usage requires an active authorized project.');
      const policy=(await tx.$queryRaw<any[]>`SELECT * FROM project_quotas WHERE tenant_id=${tenant}::uuid AND project_id=${project}`)[0];
      const rows=await tx.$queryRaw<any[]>`SELECT period::text,accepted_events,accepted_bytes,reserved_events,reserved_bytes,updated_at FROM project_usage_windows WHERE tenant_id=${tenant}::uuid AND project_id=${project} AND period>=${range.start}::date AND period<${range.end}::date ORDER BY period ASC LIMIT 90`;
      const byDay=new Map(rows.map(row=>[row.period,row]));
      const days=Array.from({length:range.days},(_,i)=>{const period=new Date(Date.parse(range.start)+i*86400000).toISOString().slice(0,10),row=byDay.get(period),pending=BigInt(row?.reserved_events??0)>0n||BigInt(row?.reserved_bytes??0)>0n;
        return {period,events:historyMetric(row?.accepted_events,row?.reserved_events,policy?.daily_events,policy?.enabled??true),bytes:historyMetric(row?.accepted_bytes,row?.reserved_bytes,policy?.daily_bytes,policy?.enabled??true),completeness:pending?'RECONCILING':'COMPLETE',historicalQuotaExceeded:null,updatedAt:row?.updated_at?.toISOString()??null,recordedWindow:!!row};});
      return {schemaVersion:1,tenantId:tenant,projectId:project,projectName:access.project.name,start:range.start,end:range.end,days,policy:this.policy(policy,access.caps.has('quotas.manage')),policyBasis:'CURRENT_POLICY_REFERENCE',historicalPolicy:'UNAVAILABLE',measuredAt:new Date().toISOString(),source:'AUTHORITATIVE_ADMISSION_WINDOWS',timeBasis:'SERVER_UTC_ADMISSION_DAY',limits:{maxDays:90},policyNote:'Historical quota policy was not snapshotted. Historical limits, utilization and exceeded states are unknown. Reference percentages use the current policy and include reservations; they are not historical utilization.'};
    },{isolationLevel:'RepeatableRead',timeout:10000});
  }
  update(p:TrustedPrincipal,tenant:string,project:string,raw:unknown,etag:string|undefined,correlation:string){
    const input=quotaInput(raw);if(!etag)throw new HttpException('If-Match is required.',428);
    if(!/^"q(0|[1-9][0-9]{0,15})"$/.test(etag))throw new BadRequestException('Invalid quota version.');
    return adminPrisma(this.config).$transaction(async tx=>{
      // Same key as Gateway; take before project row locks to prevent lock-order inversion.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'quota/'+tenant+'/'+project},0))::text`;
      const access=await this.projects.quotaAccess(tx,p,tenant,project,true);
      if(access.project.status==='ARCHIVED')throw new ConflictException('Archived project policy is read-only.');
      const before=(await tx.$queryRaw<any[]>`SELECT * FROM project_quotas WHERE tenant_id=${tenant}::uuid AND project_id=${project}`)[0];
      if(this.policy(before,true).version!==etag)throw new ConflictException('Quota changed; reload before saving.');
      const events=input.dailyEvents===null?null:BigInt(input.dailyEvents),bytes=input.dailyBytes===null?null:BigInt(input.dailyBytes);
      await tx.$executeRaw`INSERT INTO project_quotas(id,tenant_id,project_id,enabled,daily_events,daily_bytes,updated_at)
        VALUES(${randomUUID()}::uuid,${tenant}::uuid,${project},${input.enabled},${events},${bytes},clock_timestamp())
        ON CONFLICT(tenant_id,project_id) DO UPDATE SET enabled=EXCLUDED.enabled,daily_events=EXCLUDED.daily_events,daily_bytes=EXCLUDED.daily_bytes,version=project_quotas.version+1,updated_at=clock_timestamp()`;
      const after=this.policy((await tx.$queryRaw<any[]>`SELECT * FROM project_quotas WHERE tenant_id=${tenant}::uuid AND project_id=${project}`)[0],true);
      await new PrismaAuditRepository(this.config).recordAuditEvent({tenantId:tenant,actorUserId:access.actor.user.id,actorEmail:access.actor.user.email,action:'QUOTA_UPDATED',targetType:'quota',targetId:project,details:{before:this.policy(before,true),after,correlationId:correlation,outcome:'SUCCESS'}},tx);
      return after;
    },{timeout:10000});
  }
}
