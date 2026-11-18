import {randomUUID} from 'node:crypto';
import type {LogLevel} from '@skyra/logger-core';
import type {SkyraTransport,TransportStatus} from './transport.interface.js';

export type IngestionOutcome = 'accepted'|'rejected'|'unknown'|'not_sent';
export interface HttpDiagnostic {
  code:string; retryable:boolean; attempt:number; outcome:IngestionOutcome;
  batchId?:string; httpStatus?:number; retryDelayMs?:number;
}
export class IngestionError extends Error implements HttpDiagnostic {
  constructor(public readonly code:string,message:string,public readonly retryable:boolean,
    public readonly attempt:number,public readonly outcome:IngestionOutcome,
    public readonly batchId?:string,public readonly httpStatus?:number,public readonly retryDelayMs?:number){super(message);this.name='IngestionError';}
}
export interface HttpTransportOptions {
  endpoint:string; credential:string; maxBatchEvents?:number; maxBufferBytes?:number;
  timeoutMs?:number; maxAttempts?:number;
  /** Overall automatic retry horizon, separate from the per-attempt HTTP timeout. Zero disables retries. */
  retryBudgetMs?:number;
  retryBaseDelayMs?:number; retryMaxDelayMs?:number; retryJitter?:number;
  closeTimeoutMs?:number;
  /** Safe metadata only. Callback exceptions are isolated; do not recursively log through this transport. */
  onDiagnostic?:(diagnostic:Readonly<HttpDiagnostic>)=>void;
}

/** RFC 9110 delay-seconds / HTTP-date. Infinity means valid guidance beyond safe local scheduling. */
export function parseRetryAfter(value:string|null,now=Date.now(),serverDate:string|null=null):number|undefined {
  if(value===null)return undefined;
  const text=value.trim();
  if(/^\d+$/.test(text)){const n=Number(text);return Number.isSafeInteger(n)&&n<=Number.MAX_SAFE_INTEGER/1000?n*1000:Infinity;}
  // Reject permissive Date.parse inputs such as negative numbers, ISO dates and fractions.
  const datePattern=/^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/;
  if(!datePattern.test(text))return undefined;
  const target=Date.parse(text);if(!Number.isFinite(target))return undefined;
  const server=serverDate&&datePattern.test(serverDate)?Date.parse(serverDate):NaN;
  // Conservatively honor both absolute local time and relative server time when clocks differ.
  return Math.max(0,target-now,Number.isFinite(server)?target-server:0);
}
const knownCodes=new Set(['INVALID_JSON','SCHEMA_VALIDATION_FAILED','BATCH_EMPTY','BATCH_OVERSIZED','PAYLOAD_TOO_LARGE','UNAUTHORIZED','PROJECT_ACCESS_DENIED','ENVIRONMENT_MISMATCH','IDEMPOTENCY_CONFLICT','UNSUPPORTED_PROTOCOL_VERSION','PROJECT_QUOTA_EXCEEDED','RATE_LIMIT_EXCEEDED','STORAGE_NOT_READY','JOURNAL_UNAVAILABLE']);
interface Batch {id:string;body:string;count:number;bytes:number;notBefore:number;ambiguous:boolean;}

/** One immutable in-memory batch at a time. Remote acknowledgement means durable admission, not query visibility. */
export class HttpTransport implements SkyraTransport {
  #credential:string; readonly #endpoint:string; #lines:string[]=[]; #bytes=0; #batch:Batch|undefined;
  #operation:Promise<void>|undefined; #closeOperation:Promise<void>|undefined;
  #state:'open'|'closing'|'closed'='open'; #cancel=new AbortController();
  #failure:IngestionError|undefined;
  #diagnosing=false;
  #written=0;#writtenBytes=0;#retryTimers=0;#closeTimer:ReturnType<typeof setTimeout>|undefined;
  readonly #maxEvents:number;readonly #maxBytes:number;readonly #timeout:number;readonly #attempts:number;
  readonly #budget:number;readonly #base:number;readonly #maxDelay:number;readonly #jitter:number;readonly #closeTimeout:number;
  readonly #diagnostic:HttpTransportOptions['onDiagnostic'];
  constructor(options:HttpTransportOptions){
    let url:URL;try{url=new URL(options.endpoint);}catch{throw Error('Invalid ingestion endpoint');}
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/ingest/v1/logs'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Invalid ingestion endpoint');
    if(!/^skyra_live_[a-f0-9]{64}$/.test(options.credential))throw Error('Invalid managed ingestion credential');
    this.#credential=options.credential;this.#endpoint=url.href;
    const bounded=(v:number|undefined,d:number,min:number,max:number)=>{const n=v??d;if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid HTTP transport limit');return n;};
    this.#maxEvents=bounded(options.maxBatchEvents,128,1,1000);this.#maxBytes=bounded(options.maxBufferBytes,1024*1024,1024,4*1024*1024);
    this.#timeout=bounded(options.timeoutMs,5000,100,60000);this.#attempts=bounded(options.maxAttempts,3,1,5);
    this.#budget=bounded(options.retryBudgetMs,15000,0,300000);this.#closeTimeout=bounded(options.closeTimeoutMs,15000,1,300000);
    this.#base=bounded(options.retryBaseDelayMs,200,1,60000);this.#maxDelay=bounded(options.retryMaxDelayMs,2000,this.#base,60000);
    this.#jitter=options.retryJitter??0.2;if(!Number.isFinite(this.#jitter)||this.#jitter<0||this.#jitter>1)throw Error('Invalid HTTP retry jitter');
    this.#diagnostic=options.onDiagnostic;
  }
  #emit(e:HttpDiagnostic){if(this.#diagnosing)return;this.#diagnosing=true;try{this.#diagnostic?.(Object.freeze({...e}));}catch{/* User diagnostics must never change delivery. */}finally{this.#diagnosing=false;}}
  #error(code:string,message:string,retryable=false,attempt=0,outcome:IngestionOutcome='not_sent',status?:number,delay?:number){const e=new IngestionError(code,message,retryable,attempt,outcome,this.#batch?.id,status,delay);this.#emit(e);return e;}
  write(_level:LogLevel,line:string,_bytes:number):Promise<void>{
    const reject=(code:string,message:string)=>{this.#failure=this.#error(code,message);return Promise.reject(this.#failure);};
    if(this.#state!=='open')return Promise.reject(this.#error('SDK_CLOSED','HTTP transport closed'));
    if(line.includes(this.#credential))return reject('UNSAFE_EVENT','Credential-bearing event refused');
    const bytes=Buffer.byteLength(line);
    if(bytes+2>this.#maxBytes)return reject('EVENT_TOO_LARGE','HTTP event exceeds buffer limit');
    let normalized:string;try{normalized=JSON.stringify(JSON.parse(line));}catch{return reject('INVALID_EVENT','Invalid canonical event JSON');}
    if(normalized.includes(this.#credential))return reject('UNSAFE_EVENT','Credential-bearing event refused');
    if(this.#batch||this.#lines.length>=this.#maxEvents||this.#bytes+bytes+this.#lines.length+2>this.#maxBytes)return reject('BUFFER_FULL','HTTP buffer full; flush before writing more events');
    this.#lines.push(normalized);this.#bytes+=bytes;
    return this.#lines.length===this.#maxEvents?this.flush():Promise.resolve();
  }
  emergencyWrite():void{throw Error('HTTP transport has no synchronous emergency delivery; use flush or a local durable transport');}
  flush():Promise<void>{
    if(this.#operation)return this.#operation;
    if(this.#state==='closed')return Promise.reject(this.#error('SDK_CLOSED','HTTP transport closed'));
    if(this.#failure)return Promise.reject(this.#failure);
    if(!this.#batch&&this.#lines.length){const id=randomUUID();this.#batch={id,body:'{"protocol_version":"1.0","batch_id":'+JSON.stringify(id)+',"sent_at":'+JSON.stringify(new Date().toISOString())+',"batch_size":'+this.#lines.length+',"events":['+this.#lines.join(',')+']}',count:this.#lines.length,bytes:this.#bytes,notBefore:0,ambiguous:false};this.#lines=[];this.#bytes=0;}
    if(!this.#batch)return Promise.resolve();
    const operation=this.#send(this.#batch);this.#operation=operation;
    void operation.then(()=>{this.#operation=undefined;},()=>{this.#operation=undefined;});return operation;
  }
  async #read(response:Response):Promise<Record<string,any>|undefined>{
    const reader=response.body?.getReader();if(!reader)return undefined;
    let bytes=0;const chunks:Uint8Array[]=[];
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>8192)return undefined;chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{return undefined;}finally{await reader.cancel().catch(()=>{});}
  }
  async #wait(ms:number){
    if(this.#cancel.signal.aborted)throw this.#error('SDK_ABORTED','SDK operation cancelled',false,0,this.#batch?.ambiguous?'unknown':'not_sent');
    if(ms<=0)return;
    this.#retryTimers++;
    try{await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);this.#cancel.signal.removeEventListener('abort',abort);};const abort=()=>{done();reject(this.#error('SDK_ABORTED','SDK operation cancelled',false,0,this.#batch?.ambiguous?'unknown':'not_sent'));};const timer=setTimeout(()=>{done();resolve();},ms);this.#cancel.signal.addEventListener('abort',abort,{once:true});});}
    finally{this.#retryTimers--;}
  }
  async #send(batch:Batch){
    const deadline=performance.now()+(this.#budget||this.#timeout);
    for(let attempt=1;attempt<=this.#attempts;attempt++){
      const wait=Math.max(0,batch.notBefore-performance.now());
      if(wait>=deadline-performance.now())throw this.#error('RETRY_BUDGET_EXHAUSTED','Retry budget cannot honor server minimum delay; batch retained',true,attempt-1,batch.ambiguous?'unknown':'rejected',undefined,wait);
      do { await this.#wait(Math.max(0,batch.notBefore-performance.now())); } while(performance.now()<batch.notBefore);
      if(performance.now()>=deadline)throw this.#error('RETRY_BUDGET_EXHAUSTED','Retry budget expired; batch retained',true,attempt-1,batch.ambiguous?'unknown':'not_sent');
      if(this.#cancel.signal.aborted)throw this.#error('SDK_ABORTED','SDK operation cancelled',false,attempt-1,batch.ambiguous?'unknown':'not_sent');
      const controller=new AbortController();const cancel=()=>controller.abort();this.#cancel.signal.addEventListener('abort',cancel,{once:true});
      const timeout=setTimeout(()=>controller.abort(),Math.max(1,Math.min(this.#timeout,deadline-performance.now())));
      let status:number|undefined,code='NETWORK_UNCONFIRMED',retry=true,serverWait:number|undefined;
      try{
        const response=await fetch(this.#endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.#credential},body:batch.body,signal:controller.signal});
        status=response.status;serverWait=parseRetryAfter(response.headers.get('retry-after'),Date.now(),response.headers.get('date'));
        const body=await this.#read(response);
        if(response.ok){if(body?.status==='durably_accepted'&&body.batch_id===batch.id&&body.accepted_count===batch.count){this.#written+=batch.count;this.#writtenBytes+=batch.bytes;this.#batch=undefined;this.#emit({code:'DURABLY_ACCEPTED',retryable:false,attempt,outcome:'accepted',batchId:batch.id,httpStatus:status});return;}batch.ambiguous=true;code='ACKNOWLEDGEMENT_INVALID';}
        else{const error=body?.error;code=knownCodes.has(error?.code)?error.code:'HTTP_REJECTED';retry=[408,429,500,502,503,504].includes(status)&&error?.retryable!==false&&code!=='PROJECT_QUOTA_EXCEEDED';if(status>=500||status===408)batch.ambiguous=true;}
      }catch{batch.ambiguous=true;}
      finally{clearTimeout(timeout);this.#cancel.signal.removeEventListener('abort',cancel);}
      const outcome=batch.ambiguous?'unknown':'rejected';
      if(this.#cancel.signal.aborted)throw this.#error('SDK_ABORTED','SDK operation cancelled; admission may be unknown',false,attempt,outcome,status);
      if(!retry){const message=code==='PROJECT_QUOTA_EXCEEDED'?'Project daily quota exhausted; batch retained for inspection':'Ingestion rejected; automatic retry stopped';throw this.#error(code,message,false,attempt,outcome,status);}
      const backoff=Math.min(this.#base*2**(attempt-1),this.#maxDelay)*(1+Math.random()*this.#jitter);
      const delay=Math.max(serverWait??0,backoff);batch.notBefore=performance.now()+delay;
      if(attempt>=this.#attempts||this.#budget===0||delay>=deadline-performance.now())throw this.#error('RETRY_BUDGET_EXHAUSTED','Ingestion acknowledgement unavailable; retry budget exhausted, batch retained',true,attempt,outcome,status,delay);
      this.#emit({code,retryable:true,attempt,outcome,batchId:batch.id,httpStatus:status,retryDelayMs:delay});
    }
  }
  beginClose():void{this.#closeTimer??=setTimeout(()=>{void this.abort();},this.#closeTimeout);}
  close():Promise<void>{
    if(this.#closeOperation)return this.#closeOperation;
    if(this.#state==='closed')return this.#batch||this.#lines.length?Promise.reject(this.#error('SDK_CLOSED','HTTP transport closed with unconfirmed data',false,0,this.#batch?.ambiguous?'unknown':'not_sent')):Promise.resolve();
    this.#state='closing';this.beginClose();
    this.#closeOperation=(async()=>{try{await this.flush();}finally{clearTimeout(this.#closeTimer);this.#state='closed';this.#credential='';}})();return this.#closeOperation;
  }
  /** Irreversible cancellation. Retained unacknowledged data is not proof of rejection. */
  async abort():Promise<void>{clearTimeout(this.#closeTimer);this.#state='closed';this.#cancel.abort();try{await this.#operation;}catch{}finally{this.#credential='';}}
  getStatus():TransportStatus & {pendingEvents:number;pendingBytes:number;pendingBatches:number;retryTimers:number;state:string}{return {totalEventsWritten:this.#written,totalBytesWritten:this.#writtenBytes,totalEventsFsynced:0,isClosed:this.#state==='closed',pendingEvents:(this.#batch?.count??0)+this.#lines.length,pendingBytes:(this.#batch?Buffer.byteLength(this.#batch.body):0)+this.#bytes,pendingBatches:this.#batch?1:0,retryTimers:this.#retryTimers,state:this.#state};}
}
