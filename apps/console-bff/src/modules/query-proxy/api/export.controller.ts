import {BffDomainException} from '../../../common/errors/bff.errors.js';
import {Controller,Post,Req,Res,Body,UseGuards,BadRequestException,ServiceUnavailableException,ForbiddenException,BadGatewayException,HttpException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';import {createHash} from 'node:crypto';import {SessionAuthGuard} from '../../auth/guards/session-auth.guard.js';import {CsrfGuard} from '../../auth/guards/csrf.guard.js';import {QueryTokenService} from '../../auth/application/query-token.service.js';import {BffConfigService} from '../../../config/bff-config.service.js';import {validateSearchRequest} from './search-validation.js';import {EXPORT_LIMITS,ExportBuffer,exportEvent} from '../application/export-format.js';
@Controller('bff/query')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class ExportController {
 private readonly active=new Set<string>();
 constructor(private readonly config:BffConfigService,private readonly tokens:QueryTokenService,private readonly auth:SessionAuthGuard){}
 @Post('export')
 async export(@Req()req:FastifyRequest,@Res()reply:FastifyReply,@Body()raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid export request.');const d=raw as Record<string,any>;
 if(Object.keys(d).some(k=>!['format','scope','search','eventIds'].includes(k))||!['json','csv'].includes(d.format)||!['page','matching'].includes(d.scope)||Buffer.byteLength(JSON.stringify(d))>32768)throw new BadRequestException('Invalid export options.');
 if(d.scope==='matching'&&!this.config.advancedExplorerEnabled)throw new ServiceUnavailableException('Advanced Explorer is not activated.');
 if(d.eventIds!==undefined&&(d.scope!=='page'||!Array.isArray(d.eventIds)||d.eventIds.length>500||new Set(d.eventIds).size!==d.eventIds.length||!d.eventIds.every((id:unknown)=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id))))throw new BadRequestException('Invalid displayed event identifiers.');
 const search=structuredClone(validateSearchRequest(d.search));if(Buffer.byteLength(JSON.stringify(search))>8192)throw new BadRequestException('Export filters exceed the query limit.');if(Object.hasOwn(search,'tenantId'))throw new BadRequestException('Export organization comes from the session.');if(d.scope==='matching'&&search.cursor!==undefined)throw new BadRequestException('Matching-results export starts from the first page.');
 const tenant=req.session!.activeTenantId,project=String(search.projectId??(search.projects as string[]|undefined)?.[0]??req.session!.activeProjectId??'');if(!tenant||!project||Array.isArray(search.projects)&&(search.projects.length!==1||search.projects[0]!==project))throw new BadRequestException('Export exactly one authorized project.');
 this.tokens.createScopedQueryToken(req.session!,tenant,project);delete search.projectId;search.projects=[project];search.limit=d.scope==='page'?Number(search.limit??50):EXPORT_LIMITS.pageSize;
 const key=createHash('sha256').update(req.session!.sessionId).digest('hex');if(this.active.has(key)||this.active.size>=EXPORT_LIMITS.concurrent)throw new HttpException('An export is already running. Retry after it finishes.',429);this.active.add(key);
 const started=performance.now(),controller=new AbortController(),pending:Promise<unknown>[]=[];let completed:()=>void=()=>{};
 const responseDone=new Promise<void>(resolve=>{completed=resolve;});const disconnected=()=>{if(!reply.raw.writableFinished)controller.abort('cancelled');completed();};reply.raw.once('finish',completed);reply.raw.once('close',disconnected);const aborted=()=>controller.abort('cancelled');req.raw.once('aborted',aborted);if(req.raw.aborted||reply.raw.destroyed)disconnected();
 const timer=setTimeout(()=>{controller.abort('deadline');if(reply.sent&&!reply.raw.writableFinished)reply.raw.destroy();},EXPORT_LIMITS.durationMs);
 const failure=()=>new HttpException(controller.signal.reason==='deadline'?'Export time limit reached. No complete file was produced.':'Export cancelled.',controller.signal.reason==='deadline'?504:499);
 const check=()=>{if(performance.now()-started>=EXPORT_LIMITS.durationMs)controller.abort('deadline');if(controller.signal.aborted)throw failure();};
 const authority=async()=>{check();const operation=this.auth.authenticate(req);pending.push(operation.catch(()=>{}));await new Promise<void>((resolve,reject)=>{const stop=()=>reject(failure());controller.signal.addEventListener('abort',stop,{once:true});operation.then(()=>{controller.signal.removeEventListener('abort',stop);resolve();},e=>{controller.signal.removeEventListener('abort',stop);reject(e);});if(controller.signal.aborted)stop();});check();if(req.session!.activeTenantId!==tenant)throw new ForbiddenException('Export organization access changed.');return this.tokens.createScopedQueryToken(req.session!,tenant,project);};
 const buffer=new ExportBuffer(d.format,d.scope==='page'?500:EXPORT_LIMITS.events),cursors=new Set<string>();let pages=0,hasMore=false;
 try{
 for(;pages<(d.scope==='page'?1:EXPORT_LIMITS.pages);){check();const token=await authority();let response:Response;try{response=await fetch(this.config.queryServiceUrl+'/query/v1/logs/search',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(search),signal:controller.signal,redirect:'error'});}catch{check();throw new ServiceUnavailableException('Query service unavailable during export. No file produced.');}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new HttpException('Export query rejected or unavailable. Refresh the search before retrying.',[400,403,413,422,429].includes(response.status)?response.status:503);}
 const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];try{while(reader){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>EXPORT_LIMITS.upstreamBytes)throw new BadGatewayException('Export page exceeds the safe response limit.');chunks.push(part.value);check();}}finally{await reader?.cancel().catch(()=>{});}
 let data:any;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new BadGatewayException('Invalid export query response.');}
 if(data.statistics?.partial_results||Number(data.statistics?.unavailable_segments??0)>0)throw new ServiceUnavailableException('Some archives are unavailable. Export stopped without a file.');
 if(data.scope?.tenant_id!==tenant||!Array.isArray(data.scope?.searched_projects)||data.scope.searched_projects.length!==1||data.scope.searched_projects[0]!==project)throw new BadGatewayException('Invalid export response scope.');
 if(!Array.isArray(data.events)||data.pagination?.total_returned!==data.events.length||data.events.length>Number(search.limit)||typeof data.pagination?.has_more!=='boolean'||!(data.pagination.next_cursor===null||data.pagination.next_cursor===undefined||typeof data.pagination.next_cursor==='string'&&data.pagination.next_cursor.length<=1024))throw new BadGatewayException('Invalid export pagination.');
 pages++;for(const rawEvent of data.events){check();const event=exportEvent(rawEvent,tenant,project),digest=createHash('sha256').update(JSON.stringify(event)).digest('hex');if(!buffer.add(event,digest))break;}
 hasMore=data.pagination.has_more;if(buffer.truncated||!hasMore||d.scope==='page')break;
 const cursor=data.pagination.next_cursor;if(!cursor||cursors.has(cursor)||!data.events.length)throw new BadGatewayException('Export cursor did not advance.');cursors.add(cursor);search.cursor=cursor;
 if(buffer.chunks.length>=EXPORT_LIMITS.events){buffer.truncated=true;buffer.reason='event_limit';break;}
 }
 if(!buffer.truncated&&hasMore&&d.scope!=='page'){buffer.truncated=true;buffer.reason='page_limit';}
 if(d.eventIds!==undefined&&JSON.stringify([...buffer.seen.keys()])!==JSON.stringify(d.eventIds))throw new HttpException('The displayed page changed. Refresh before exporting it.',409);
 const metadata={consistency:'bounded-keyset-traversal',scope:d.scope,projectId:project,timeRange:search.time_range,pages,limit:EXPORT_LIMITS.events,maxBytes:EXPORT_LIMITS.bytes};const {cursor:ignored,...filters}=search;const content=buffer.finish(metadata,{scope:{tenant_id:tenant,searched_projects:[project]},filters});check();await authority();check();
 const filename='skyra-logs-'+(d.scope==='matching'?'matching-results':'current-page')+(buffer.truncated?'-truncated':'')+'.'+d.format;
 reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('Content-Disposition','attachment; filename="'+filename+'"').header('X-Content-Type-Options','nosniff').header('X-Export-Truncated',String(buffer.truncated)).header('X-Export-Reason',buffer.reason??'').header('X-Export-Count',String(buffer.chunks.length)).header('X-Export-Pages',String(pages)).header('X-Export-Consistency','bounded-keyset-traversal').type(d.format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8').status(200).send(Buffer.from(content,'utf8'));
 }catch(error){check();if(error instanceof HttpException||error instanceof BffDomainException)throw error;throw new ServiceUnavailableException('Export failed. No complete file was produced.');}finally{
 // Keep slots until download finishes/closes AND any cancelled authority query settles.
 void Promise.allSettled([...pending,responseDone]).then(()=>{clearTimeout(timer);req.raw.removeListener('aborted',aborted);reply.raw.removeListener('finish',completed);reply.raw.removeListener('close',disconnected);this.active.delete(key);});
 }
 }
}
