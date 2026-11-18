import {Controller,Get,Param,Query,Req,Res,UseGuards,ForbiddenException,BadRequestException,BadGatewayException} from '@nestjs/common';import type {FastifyRequest,FastifyReply} from 'fastify';
import {SessionAuthGuard} from '../guards/session-auth.guard.js';import {CsrfGuard} from '../guards/csrf.guard.js';import {AdminClientService} from '../application/admin-client.service.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const labels:Record<string,string>={SAVED_SEARCH_CREATED:'Shared saved search created',SAVED_SEARCH_UPDATED:'Shared saved search updated',SAVED_SEARCH_DELETED:'Shared saved search deleted',TENANT_UPDATED:'Organization updated',MEMBER_INVITED:'Member invited',MEMBER_ROLE_CHANGED:'Member role changed',MEMBER_REMOVED:'Membership revoked',MEMBER_SUSPENDED:'Membership suspended',MEMBER_REACTIVATED:'Membership reactivated',PROJECT_CREATED:'Project created',PROJECT_UPDATED:'Project updated',PROJECT_DISABLED:'Project suspended',PROJECT_REACTIVATED:'Project reactivated',PROJECT_ARCHIVED:'Project archived',CREDENTIAL_CREATED:'Credential created',CREDENTIAL_ROTATED:'Credential rotated',CREDENTIAL_REVOKED:'Credential revoked',QUOTA_UPDATED:'Quota policy changed',RETENTION_POLICY_CHANGED:'Retention policy changed'};
const fieldLabels:Record<string,string>={name:'Display name',status:'Status',roles:'Roles',id:'Credential ID',isRevoked:'Revoked',expiresAt:'Expires at',rotatedFromId:'Replaces credential',enabled:'Daily enforcement',dailyEvents:'Daily events',dailyBytes:'Daily bytes',retentionDays:'Retention days'};
const text=(v:unknown,max=255)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)&&!/skyra_live_|bearer\s|(?:postgres(?:ql)?|https?):\/\/|-----BEGIN|eyJ[\w-]+\.|(?:password|secret|token)\s*[:=]|^[a-f0-9]{64}$/i.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
export function publicAuditEvent(d:any){
  if(!d||!uuid.test(d.id)||!timestamp(d.timestamp)||typeof d.action!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(d.action)||!(d.actorId===null||typeof d.actorId==='string'&&uuid.test(d.actorId))||!['saved_search','tenant','membership','project','credential','quota','retention','unknown'].includes(d.resourceType)||!text(d.resourceId,64)||!Array.isArray(d.changes)||d.changes.length>8||typeof d.metadataOmitted!=='boolean'||!(d.correlationId===null||text(d.correlationId,64)&&/^[A-Za-z0-9-]{1,64}$/.test(d.correlationId)))throw new BadGatewayException('Invalid audit event response.');
  const known=Object.hasOwn(labels,d.action),allowed=d.action==='TENANT_UPDATED'?['name']:d.action.startsWith('PROJECT_')?['name','status']:d.action.startsWith('MEMBER_')?['roles','status']:d.action.startsWith('CREDENTIAL_')?['id','isRevoked','expiresAt','rotatedFromId']:d.action==='QUOTA_UPDATED'?['enabled','dailyEvents','dailyBytes']:d.action==='RETENTION_POLICY_CHANGED'?['retentionDays']:[];
  const validValue=(field:string,v:any)=>{
    if(v===null)return true;
    if(['isRevoked','enabled'].includes(field))return typeof v==='boolean';
    if(['id','rotatedFromId'].includes(field))return typeof v==='string'&&uuid.test(v);
    if(field==='expiresAt')return timestamp(v);
    if(['dailyEvents','dailyBytes'].includes(field))return typeof v==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(v)&&BigInt(v)<=9007199254740991n;
    if(field==='roles')return typeof v==='string'&&v.split(', ').length<=5&&v.split(', ').every(r=>['OrgOwner','OrgAdmin','ProjectAdmin','Developer','Viewer'].includes(r));
    if(field==='status')return ['ACTIVE','SUSPENDED','ARCHIVED','REVOKED','PENDING_INVITE','DECOMMISSIONED'].includes(v);
    if(field==='retentionDays')return typeof v==='string'&&/^\d{1,5}$/.test(v)&&Number(v)<=36500;
    return field==='name'&&text(v);
  };
  const side=(field:string,v:any,available:boolean)=>!available?v===null:(v!==null||['dailyEvents','dailyBytes'].includes(field))&&validValue(field,v);
  const changes=known?d.changes.map((c:any)=>{if(!c||!allowed.includes(c.field)||typeof c.beforeAvailable!=='boolean'||typeof c.afterAvailable!=='boolean'||!side(c.field,c.before,c.beforeAvailable)||!side(c.field,c.after,c.afterAvailable))throw new BadGatewayException('Invalid audit changes.');return {field:c.field,label:c.field==='name'&&d.action.startsWith('PROJECT_')?'Project name':fieldLabels[c.field],before:c.before,after:c.after,beforeAvailable:c.beforeAvailable,afterAvailable:c.afterAvailable};}):[];
  const label=known?labels[d.action]!:'Unknown administrative action';
  const changed=changes.filter((c:any)=>!(c.beforeAvailable&&c.afterAvailable&&c.before===c.after));
  return {id:d.id,timestamp:d.timestamp,action:d.action,actionLabel:label,actorId:d.actorId,actorDisplayName:d.actorId&&text(d.actorDisplayName,80)&&d.actorDisplayName.length&&!/[@\p{Cf}]/u.test(d.actorDisplayName)?d.actorDisplayName:null,actorLabel:d.actorId&&text(d.actorDisplayName,80)&&d.actorDisplayName.length&&!/[@\p{Cf}]/u.test(d.actorDisplayName)?d.actorDisplayName+' · Actor '+d.actorId:d.actorId?'Actor '+d.actorId:'Actor unavailable',resourceType:d.resourceType,resourceId:d.resourceId,
    summary:known?label+(changed.length?' · '+changed.map((c:any)=>c.label).join(', '):changes.length?' · Recorded values unchanged':' · Historical change details unavailable'):'Historical event type is not recognized; metadata is withheld',correlationId:d.correlationId,changes,metadataOmitted:d.metadataOmitted||!known};
}
export function auditFilters(q:Record<string,unknown>){
  if(Object.keys(q).some(k=>!['action','actorId','correlationId','resourceType','resourceId','projectId','start','end','limit','cursor'].includes(k))||Object.values(q).some(v=>typeof v!=='string'||v.length>2048))throw new BadRequestException('Unsupported audit filters.');
  return new URLSearchParams(q as Record<string,string>).toString();
}
@Controller('bff/organization/audit')
@UseGuards(SessionAuthGuard,CsrfGuard)
export class AuditHistoryController {
  constructor(private readonly admin:AdminClientService){}
  private async forward(req:FastifyRequest,reply:FastifyReply,q:Record<string,unknown>,id?:string,access=false){
    const session=req.session!,tenant=session.activeTenantId;if(!tenant||!session.memberships.some(m=>m.tenantId===tenant))throw new ForbiddenException('Select an authorized organization.');
    reply.header('Cache-Control','no-store').header('Pragma','no-cache');const result=await this.admin.requestAudit(session.user.id,tenant,auditFilters(q),id,access),d=result.data as any;
    if(access){if(d?.canRead!==true||!Array.isArray(d.actions))throw new BadGatewayException('Invalid audit access response.');return {canRead:true,tenantId:tenant,actions:Object.entries(labels).map(([value,label])=>({value,label}))};}
    if(id){const event=publicAuditEvent(d);if(event.id!==id)throw new BadGatewayException('Invalid audit event identity.');return event;}
    if(!d||d.tenantId!==tenant||!Array.isArray(d.items)||d.items.length>100||d.order!=='timestamp_desc_id_desc'||!Number.isInteger(d.pageSize)||d.pageSize<1||d.pageSize>100||!(d.nextCursor===null||typeof d.nextCursor==='string'&&d.nextCursor.length<=2048&&/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(d.nextCursor)))throw new BadGatewayException('Invalid audit page response.');
    if(!timestamp(d.watermark))throw new BadGatewayException('Invalid audit watermark.');
    return {watermark:d.watermark,items:d.items.map(publicAuditEvent),nextCursor:d.nextCursor,order:d.order,pageSize:d.pageSize};
  }
  @Get('access')access(@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,{},undefined,true);}
  @Get()list(@Query()q:Record<string,unknown>,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,q);}
  @Get(':eventId')read(@Param('eventId')id:string,@Req()req:FastifyRequest,@Res({passthrough:true})reply:FastifyReply){return this.forward(req,reply,{},id);}
}
