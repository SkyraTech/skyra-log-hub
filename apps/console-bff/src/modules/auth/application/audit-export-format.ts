import {BadGatewayException} from '@nestjs/common';
export const AUDIT_EXPORT_LIMITS={events:1000,pages:10,pageSize:100,bytes:5*1024*1024,durationMs:15000,concurrent:2} as const;
/** Quote every field, neutralizing leading controls/format characters before spreadsheet formulas. */
export function auditCsvCell(value:unknown){const raw=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value),clean=raw.replace(/^[\p{Cc}\p{Cf}\p{Z}\s]+/u,'');const safe=/^[=+\-@]/.test(clean)||/^[\p{Cc}\p{Cf}]/u.test(raw)?"'"+raw:raw;return '"'+safe.replace(/"/g,'""')+'"';}
export function auditOrderMicros(stamp:string){return BigInt(Date.parse(stamp))*1000n+BigInt((stamp.split('.')[1]?.replace('Z','')??'').padEnd(6,'0').slice(3,6));}
export class AuditExportBuffer {
 readonly items:Record<string,any>[]=[];private readonly ids=new Set<string>();private estimated=8192;truncated=false;reason:string|null=null;
 constructor(readonly format:'json'|'csv'){}
 private csv(event:Record<string,any>){return ['id','timestamp','actorId','actorLabel','action','resourceType','resourceId','correlationId','summary','changes','metadataOmitted'].map(k=>auditCsvCell(event[k])).join(',')+'\r\n';}
 add(event:Record<string,any>){
  if(this.ids.has(event.id))throw new BadGatewayException('Audit export repeated an event. No file produced.');
  const previous=this.items.at(-1);if(previous){const a=auditOrderMicros(previous.timestamp),b=auditOrderMicros(event.timestamp);if(b>a||b===a&&event.id>=previous.id)throw new BadGatewayException('Audit export order did not advance.');}
  const size=Buffer.byteLength(this.format==='json'?JSON.stringify(event)+',':this.csv(event),'utf8');if(this.items.length>=AUDIT_EXPORT_LIMITS.events||this.estimated+size>AUDIT_EXPORT_LIMITS.bytes){this.truncated=true;this.reason=this.items.length>=AUDIT_EXPORT_LIMITS.events?'record_limit':'byte_limit';return false;}this.ids.add(event.id);this.estimated+=size;this.items.push(event);return true;
 }
 finish(metadata:Record<string,unknown>){const output=this.format==='json'?JSON.stringify({metadata:{...metadata,count:this.items.length,truncated:this.truncated,reason:this.reason},items:this.items}):['id','timestamp','actorId','actorLabel','action','resourceType','resourceId','correlationId','summary','changes','metadataOmitted'].join(',')+'\r\n'+this.items.map(e=>this.csv(e)).join('');if(Buffer.byteLength(output)>AUDIT_EXPORT_LIMITS.bytes)throw new BadGatewayException('Audit output exceeds the safe bound.');return output;}
}
