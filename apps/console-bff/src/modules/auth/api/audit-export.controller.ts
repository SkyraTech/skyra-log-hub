import {Controller,Post,Body,Req,Res,UseGuards,BadRequestException,BadGatewayException,ForbiddenException,HttpException,ServiceUnavailableException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';import {createHash} from 'node:crypto';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {AdminClientService} from '../application/admin-client.service.js';import {BffConfigService} from '../../../config/bff-config.service.js';import {publicAuditEvent,auditFilters} from './audit-history.controller.js';import {AUDIT_EXPORT_LIMITS as L,AuditExportBuffer} from '../application/audit-export-format.js';
@Controller('bff/organization/audit/export')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class AuditExportController {
 private readonly active=new Set<string>();
 constructor(private readonly admin:AdminClientService,private readonly auth:SessionAuthGuard,private readonly config:BffConfigService){}
 @Post()async export(@Body()raw:unknown,@Req()req:FastifyRequest,@Res()reply:FastifyReply){
  if(!this.config.advancedAuditUsageEnabled)throw new ServiceUnavailableException('Advanced Audit and Usage is not activated.');
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw))>4096)throw new BadRequestException('Invalid audit export.');const d=raw as any;
  if(Object.keys(d).length!==2||Object.keys(d).some(k=>!['format','filters'].includes(k))||!['json','csv'].includes(d.format)||!d.filters||typeof d.filters!=='object'||Array.isArray(d.filters)||Object.hasOwn(d.filters,'cursor')||Object.hasOwn(d.filters,'limit'))throw new BadRequestException('Export matching audit filters from the first page.');
  auditFilters(d.filters);const filters={...d.filters,limit:String(L.pageSize)},tenant=req.session!.activeTenantId;if(!tenant)throw new ForbiddenException('Select an authorized organization.');
  const key=createHash('sha256').update(req.session!.sessionId).digest('hex');if(this.active.has(key)||this.active.size>=L.concurrent)throw new HttpException('Audit export capacity is occupied. Retry after completion.',429);this.active.add(key);
  const controller=new AbortController(),pending:Promise<unknown>[]=[];let done=()=>{};const responseDone=new Promise<void>(resolve=>done=resolve),disconnected=()=>{if(!reply.raw.writableFinished)controller.abort('cancelled');done();},aborted=()=>controller.abort('cancelled');
  reply.raw.once('finish',done);reply.raw.once('close',disconnected);req.raw.once('aborted',aborted);if(req.raw.aborted||reply.raw.destroyed)disconnected();
  const timer=setTimeout(()=>{controller.abort('deadline');if(reply.sent&&!reply.raw.writableFinished)reply.raw.destroy();},L.durationMs);
  const failure=()=>new HttpException(controller.signal.reason==='deadline'?'Audit export deadline reached. No complete file produced.':'Audit export cancelled.',controller.signal.reason==='deadline'?504:499),check=()=>{if(controller.signal.aborted)throw failure();};
  const guarded=async<T>(operation:Promise<T>)=>{pending.push(operation.catch(()=>{}));return new Promise<T>((resolve,reject)=>{const stop=()=>reject(failure());controller.signal.addEventListener('abort',stop,{once:true});operation.then(v=>{controller.signal.removeEventListener('abort',stop);resolve(v);},e=>{controller.signal.removeEventListener('abort',stop);reject(e);});if(controller.signal.aborted)stop();});};
  const authority=async()=>{check();await guarded(this.auth.authenticate(req));check();if(req.session!.activeTenantId!==tenant)throw new ForbiddenException('Audit organization changed.');};
  const buffer=new AuditExportBuffer(d.format),seen=new Set<string>();let cursor:string|undefined,watermark:string|undefined,pages=0,more=false;
  try{
   for(;pages<L.pages;){await authority();const query=new URLSearchParams({...filters,...(cursor?{cursor}:{})}).toString(),result=await guarded(this.admin.requestAudit(req.session!.user.id,tenant,query,undefined,false,controller.signal));check();const page=result.data as any;
    if(page?.tenantId!==tenant||!Array.isArray(page.items)||page.items.length>L.pageSize||page.pageSize!==L.pageSize||page.order!=='timestamp_desc_id_desc'||typeof page.watermark!=='string'||!Number.isFinite(Date.parse(page.watermark))||!(page.nextCursor===null||typeof page.nextCursor==='string'&&page.nextCursor.length<=2048&&/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(page.nextCursor)))throw new BadGatewayException('Invalid audit export page.');
    if(watermark&&page.watermark!==watermark)throw new BadGatewayException('Audit watermark changed.');watermark=page.watermark;pages++;
    for(const item of page.items){check();if(!buffer.add(publicAuditEvent(item)))break;}more=page.nextCursor!==null;
    if(buffer.truncated||!more)break;if(!page.items.length||seen.has(page.nextCursor))throw new BadGatewayException('Audit cursor did not advance.');seen.add(page.nextCursor);cursor=page.nextCursor;
    if(buffer.items.length===L.events){buffer.truncated=true;buffer.reason='record_limit';break;}
   }
   if(more&&!buffer.truncated){buffer.truncated=true;buffer.reason='page_limit';}
   await authority();await guarded(this.admin.requestAudit(req.session!.user.id,tenant,'',undefined,true,controller.signal));check();
   const content=buffer.finish({consistency:'watermark-bounded-keyset-traversal',watermark,filters:d.filters,pages,limits:L});
   reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('X-Content-Type-Options','nosniff').header('Content-Disposition','attachment; filename="skyra-audit-matching'+(buffer.truncated?'-truncated':'')+'.'+d.format+'"').header('X-Export-Truncated',String(buffer.truncated)).header('X-Export-Reason',buffer.reason??'').header('X-Export-Count',String(buffer.items.length)).header('X-Export-Pages',String(pages)).header('X-Export-Watermark',watermark!).header('X-Export-Consistency','watermark-bounded-keyset-traversal').type(d.format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8').status(200).send(Buffer.from(content,'utf8'));
  }finally{void Promise.allSettled([...pending,responseDone]).then(()=>{clearTimeout(timer);req.raw.removeListener('aborted',aborted);reply.raw.removeListener('finish',done);reply.raw.removeListener('close',disconnected);this.active.delete(key);});}
 }
}
