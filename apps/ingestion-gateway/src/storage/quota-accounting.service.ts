import {Injectable, Optional, Inject, OnApplicationBootstrap, OnModuleDestroy} from '@nestjs/common';
import {Pool, type PoolClient} from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {WalJournalService} from './wal/wal-journal.service.js';
import type {WalCommitReceipt,WalFrame} from './storage.interface.js';
import {GatewayException} from '../common/types/gateway-exception.js';
import {ErrorCode} from '../common/types/error-code.enum.js';

// Injectable clocks/faults are replaced only by isolated test modules, never HTTP input or environment timestamps.
export const QUOTA_CLOCK=Symbol('QUOTA_CLOCK');
export const QUOTA_FAULT=Symbol('QUOTA_FAULT');
type Admission={tenantId:string;projectId:string;batchId:string;eventCount:number;contentDigestSha256:string};
type Row=Record<string,any>;
const MAX=9007199254740991n;
const unavailable=()=>new GatewayException(ErrorCode.STORAGE_NOT_READY,'Usage accounting requires recovery; retry later.',503,{retryable:true});

/** A pinned PostgreSQL session lock spans the reservation and WAL boundary. No cross-resource ACID claim. */
@Injectable()
export class QuotaAccountingService implements OnApplicationBootstrap,OnModuleDestroy {
  readonly enabled=process.env['INGESTION_QUOTAS_ENABLED']==='true';
  private pool?:Pool;
  private journalId='';
  private ready=false;
  private timer?:ReturnType<typeof setInterval>;
  private recovering?:Promise<void>;
  constructor(private readonly wal:WalJournalService,
    @Optional() @Inject(QUOTA_CLOCK) private readonly clock:()=>Date=()=>new Date(),
    @Optional() @Inject(QUOTA_FAULT) private readonly fault:(stage:string)=>Promise<void>=async()=>{}){}

  async onApplicationBootstrap(){
    if(!this.enabled)return;
    if(!process.env['DATABASE_URL']||!process.env['WAL_DIRECTORY']||!this.wal.getStatus().isReady)throw Error('Meter activation requires explicit database and ready owned journal');
    this.pool=new Pool({connectionString:process.env['DATABASE_URL'],max:8,connectionTimeoutMillis:3000,statement_timeout:10000,lock_timeout:5000,application_name:'skyra-quota-admission'});
    const dir=fs.realpathSync(this.wal.getStatus().walDir),marker=path.join(dir,'quota-journal.json');
    const frames=this.wal.readPublicationFrames();
    const c=await this.pool.connect();
    try{
      await c.query('SELECT tenant_id,accepted_events,reserved_events FROM project_usage_windows LIMIT 0');
      if(fs.existsSync(marker)){
        if(fs.lstatSync(marker).isSymbolicLink())throw Error('Redirected quota journal marker');
        const m=JSON.parse(fs.readFileSync(marker,'utf8'));
        if(!/^[a-f0-9-]{36}$/.test(m.id))throw Error('Invalid quota journal marker');this.journalId=m.id;
      }else{
        if(frames.length)throw Error('First metering activation requires an empty journal; existing accepted history is not retroactively charged');
        this.journalId=randomUUID();const fd=fs.openSync(marker,'wx',0o600);
        try{fs.writeFileSync(fd,JSON.stringify({id:this.journalId}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      }
      const fingerprint=createHash('sha256').update(process.platform==='win32'?dir.toLowerCase():dir).digest('hex');
      await c.query('INSERT INTO quota_journals(id,path_hash) VALUES($1,$2) ON CONFLICT DO NOTHING',[this.journalId,fingerprint]);
      const r=await c.query('SELECT path_hash FROM quota_journals WHERE id=$1',[this.journalId]);
      if(r.rows[0]?.path_hash!==fingerprint)throw Error('Journal namespace belongs to another store');
      // Recovery can turn surviving ambiguous writes into accepted data only after fsync of verified files.
      for(const name of new Set(frames.map(f=>f.segment))){const fd=fs.openSync(path.join(dir,name),'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
    }finally{c.release();}
    await this.reconcile(true);this.ready=true;
    this.timer=setInterval(()=>{if(!this.recovering)this.recovering=this.reconcile(false).catch(()=>{this.ready=false;}).finally(()=>{this.recovering=undefined;});},1000);this.timer.unref();
  }
  get isReady(){return !this.enabled||this.ready;}
  async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.recovering;await this.pool?.end();}
  private async locked<T>(tenant:string,project:string,run:(c:PoolClient)=>Promise<T>):Promise<T>{
    if(!this.pool)throw unavailable();const c=await this.pool.connect();let locked=false,broken=false;
    try{await c.query("SELECT pg_advisory_lock(hashtextextended($1,0))",['quota/'+tenant+'/'+project]);locked=true;return await run(c);}
    catch(e){await c.query('ROLLBACK').catch(()=>{broken=true;});throw e;}
    finally{if(locked)await c.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",['quota/'+tenant+'/'+project]).catch(()=>{broken=true;});c.release(broken);}
  }
  private async finalize(c:PoolClient,row:Row,receipt:WalCommitReceipt){
    const changed=await c.query(`UPDATE quota_admissions SET state='COMMITTED',receipt=$4::jsonb,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND project_id=$2 AND batch_id=$3 AND state='RESERVED' RETURNING batch_id`,[row.tenant_id,row.project_id,row.batch_id,JSON.stringify(receipt)]);
    if(!changed.rowCount)return;
    await c.query(`UPDATE project_usage_windows SET reserved_events=reserved_events-$4,reserved_bytes=reserved_bytes-$5,
      accepted_events=accepted_events+$4,accepted_bytes=accepted_bytes+$5,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND project_id=$2 AND period=$3`,[row.tenant_id,row.project_id,row.period,row.events,row.bytes]);
  }
  async reconcile(startup=false){
    if(!this.pool)return;const frames=this.wal.readPublicationFrames();
    const rows=(await this.pool.query("SELECT * FROM quota_admissions WHERE journal_id=$1 AND state='RESERVED'",[this.journalId])).rows;
    for(const row of rows)await this.locked(row.tenant_id,row.project_id,async c=>{
      await c.query('BEGIN');const current=(await c.query("SELECT * FROM quota_admissions WHERE tenant_id=$1 AND project_id=$2 AND batch_id=$3 AND state='RESERVED' FOR UPDATE",[row.tenant_id,row.project_id,row.batch_id])).rows[0];
      if(!current){await c.query('COMMIT');return;}
      const found=frames.find(({frame:f})=>f.tenantId===row.tenant_id&&f.projectId===row.project_id&&f.batchId===row.batch_id);
      if(found){const f=found.frame;if(f.contentDigestSha256!==row.digest||f.eventCount!==row.events||BigInt(f.payload.length)!==BigInt(row.bytes))throw Error('Accounting journal mismatch');
        await this.finalize(c,row,{duplicate:false,receiptId:row.receipt_id,batchId:row.batch_id,tenantId:row.tenant_id,projectId:row.project_id,contentDigest:row.digest,acceptedCount:row.events,journalSegment:found.segment,journalOffset:f.offset,committedAt:new Date().toISOString()});
      }else if(startup){
        await c.query("UPDATE quota_admissions SET state='CANCELLED',updated_at=clock_timestamp() WHERE tenant_id=$1 AND project_id=$2 AND batch_id=$3",[row.tenant_id,row.project_id,row.batch_id]);
        await c.query('UPDATE project_usage_windows SET reserved_events=reserved_events-$4,reserved_bytes=reserved_bytes-$5,updated_at=clock_timestamp() WHERE tenant_id=$1 AND project_id=$2 AND period=$3',[row.tenant_id,row.project_id,row.period,row.events,row.bytes]);
      }
      await this.fault('reconciliation-before-commit');await c.query('COMMIT');
    });
    if(!startup)this.ready=true;
  }
  async admit(meta:Admission,payload:Buffer):Promise<{receipt:WalCommitReceipt;frame?:WalFrame;duplicate:boolean}>{
    if(!this.ready||!this.wal.getStatus().isReady)throw unavailable();
    try{return await this.locked(meta.tenantId,meta.projectId,async c=>{
      await c.query('BEGIN');
      const active=(await c.query("SELECT public.lock_active_quota_project($1::uuid,$2::text) AS active",[meta.tenantId,meta.projectId])).rows[0]?.active;
      if(!active)throw new GatewayException(ErrorCode.PROJECT_ACCESS_DENIED,'Project is not active.',403);
      let row=(await c.query('SELECT * FROM quota_admissions WHERE tenant_id=$1 AND project_id=$2 AND batch_id=$3',[meta.tenantId,meta.projectId,meta.batchId])).rows[0];
      if(row){
        if(row.digest!==meta.contentDigestSha256||row.events!==meta.eventCount||BigInt(row.bytes)!==BigInt(payload.length))throw new GatewayException(ErrorCode.IDEMPOTENCY_CONFLICT,'Batch identity has different content.',409);
        if(row.state==='COMMITTED'){await c.query('COMMIT');return {receipt:row.receipt,duplicate:true};}
        if(row.state==='RESERVED')throw unavailable();
      }
      const period=this.clock().toISOString().slice(0,10);
      const policy=(await c.query('SELECT * FROM project_quotas WHERE tenant_id=$1 AND project_id=$2',[meta.tenantId,meta.projectId])).rows[0];
      if(policy&&payload.length>policy.max_payload_bytes)throw new GatewayException(ErrorCode.PAYLOAD_TOO_LARGE,'Canonical event payload exceeds project request limit.',413);
      await c.query('INSERT INTO project_usage_windows(tenant_id,project_id,period) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[meta.tenantId,meta.projectId,period]);
      const usage=(await c.query('SELECT * FROM project_usage_windows WHERE tenant_id=$1 AND project_id=$2 AND period=$3 FOR UPDATE',[meta.tenantId,meta.projectId,period])).rows[0];
      const events=BigInt(usage.accepted_events)+BigInt(usage.reserved_events)+BigInt(meta.eventCount),bytes=BigInt(usage.accepted_bytes)+BigInt(usage.reserved_bytes)+BigInt(payload.length);
      if(events>MAX||bytes>MAX)throw unavailable();
      if(policy?.enabled&&((policy.daily_events!==null&&events>BigInt(policy.daily_events))||(policy.daily_bytes!==null&&bytes>BigInt(policy.daily_bytes)))){
        throw new GatewayException(ErrorCode.PROJECT_QUOTA_EXCEEDED,'Project daily ingestion quota exceeded.',429,{retryable:false,details:{period,resetAt:new Date(Date.parse(period+'T00:00:00Z')+86400000).toISOString()}});
      }
      await c.query('UPDATE project_usage_windows SET reserved_events=reserved_events+$4,reserved_bytes=reserved_bytes+$5,updated_at=clock_timestamp() WHERE tenant_id=$1 AND project_id=$2 AND period=$3',[meta.tenantId,meta.projectId,period,meta.eventCount,payload.length]);
      row=(await c.query(`INSERT INTO quota_admissions(tenant_id,project_id,batch_id,digest,events,bytes,period,journal_id,state,receipt_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RESERVED',$9) ON CONFLICT(tenant_id,project_id,batch_id)
        DO UPDATE SET period=EXCLUDED.period,journal_id=EXCLUDED.journal_id,state='RESERVED',updated_at=clock_timestamp() RETURNING *`,[meta.tenantId,meta.projectId,meta.batchId,meta.contentDigestSha256,meta.eventCount,payload.length,period,this.journalId,randomUUID()])).rows[0];
      await c.query('COMMIT');await this.fault('reserved');
      // Reservation survives a rollback of this second transaction and reserves capacity during recovery.
      await c.query('BEGIN');
      const stillActive=(await c.query("SELECT public.lock_active_quota_project($1::uuid,$2::text) AS active",[meta.tenantId,meta.projectId])).rows[0]?.active;
      if(!stillActive){await c.query('ROLLBACK');throw unavailable();}
      let result:{receipt:WalCommitReceipt;frame:WalFrame};
      try{result=await this.wal.appendBatch(meta,payload);}catch{this.wal.quarantineAccounting();throw unavailable();}
      result.receipt.receiptId=row.receipt_id;
      try{await this.fault('wal-durable');await this.finalize(c,row,result.receipt);await this.fault('finalized-before-commit');await c.query('COMMIT');}
      catch{await c.query('ROLLBACK').catch(()=>{});this.ready=false;/* fsync acceptance remains authoritative; reservation is reconciled. */}
      return {...result,duplicate:false};
    });}catch(e){if(e instanceof GatewayException)throw e;this.ready=false;throw unavailable();}
  }
}
