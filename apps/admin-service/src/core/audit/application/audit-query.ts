import {BadRequestException} from '@nestjs/common';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {AUDIT_RESOURCES} from './audit-projection.js';
export const auditUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const stamp=/^[1-9]\d{3}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/;
export function auditTimestamp(v:unknown):v is string{return typeof v==='string'&&stamp.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v.slice(0,10);}
export function auditMicros(v:string){return BigInt(Date.parse(v))*1000n+BigInt((v.split('.')[1]?.replace('Z','')??'').padEnd(6,'0').slice(3,6));}
export function auditQuery(raw:Record<string,unknown>){
  if(Object.keys(raw).some(k=>!['action','actorId','correlationId','resourceType','resourceId','projectId','start','end','limit','cursor'].includes(k))||Object.values(raw).some(v=>typeof v!=='string'))throw new BadRequestException('Unsupported audit filters.');
  const q={correlationId:String(raw.correlationId??''),action:String(raw.action??''),actorId:String(raw.actorId??''),resourceType:String(raw.resourceType??''),resourceId:String(raw.resourceId??''),projectId:String(raw.projectId??''),start:String(raw.start??''),end:String(raw.end??''),limit:String(raw.limit??'25'),cursor:String(raw.cursor??'')};
  if(q.correlationId&&!/^[a-zA-Z0-9-]{1,64}$/.test(q.correlationId)||q.action&&!/^[A-Z][A-Z0-9_]{0,63}$/.test(q.action)||q.actorId&&!auditUuid.test(q.actorId)||q.resourceType&&!AUDIT_RESOURCES.includes(q.resourceType as any)||q.resourceId&&!/^[a-zA-Z0-9_-]{1,64}$/.test(q.resourceId)||q.projectId&&!/^[a-zA-Z0-9_-]{1,64}$/.test(q.projectId)||!/^([1-9]|[1-9][0-9]|100)$/.test(q.limit)||q.cursor.length>2048)throw new BadRequestException('Invalid audit filters.');
  if((q.start||q.end)&&(!auditTimestamp(q.start)||!auditTimestamp(q.end)||auditMicros(q.start)>=auditMicros(q.end)||auditMicros(q.end)-auditMicros(q.start)>366n*86400000000n))throw new BadRequestException('Use an increasing UTC range of at most 366 days.');
  return q;
}
export function auditBinding(q:ReturnType<typeof auditQuery>,tenant:string,user:string){return createHash('sha256').update(JSON.stringify([tenant,user,'tenant-audit.read',q.action,q.actorId,q.correlationId,q.resourceType,q.resourceId,q.projectId,q.start,q.end,q.limit])).digest('hex');}
export function signAuditCursor(secret:string,binding:string,anchor:string,last:{timestamp:string;id:string},expires=Math.floor(Date.now()/1000)+900){
  const payload=Buffer.from(JSON.stringify({v:1,binding,anchor,last,expires})).toString('base64url');return payload+'.'+createHmac('sha256',secret).update('audit-cursor/v1\0'+payload).digest('base64url');
}
export function readAuditCursor(secret:string,cursor:string,binding:string){
  try{
    if(cursor.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))throw Error();
    const [payload,sig]=cursor.split('.'),actual=Buffer.from(sig!,'base64url'),expected=createHmac('sha256',secret).update('audit-cursor/v1\0'+payload).digest();
    if(actual.toString('base64url')!==sig||Buffer.from(payload!,'base64url').toString('base64url')!==payload||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
    const d=JSON.parse(Buffer.from(payload!,'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);
    if(d.v!==1||d.binding!==binding||!Number.isSafeInteger(d.expires)||d.expires<=now||d.expires>now+900||!auditTimestamp(d.anchor)||!auditTimestamp(d.last?.timestamp)||!auditUuid.test(d.last?.id)||auditMicros(d.last.timestamp)>auditMicros(d.anchor))throw Error();
    return d as {anchor:string;last:{timestamp:string;id:string};expires:number};
  }catch{throw new BadRequestException('Invalid or expired audit cursor; reload the first page.');}
}
