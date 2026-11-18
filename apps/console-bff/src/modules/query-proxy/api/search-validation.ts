import {InvalidArgumentException} from '../../../common/errors/bff.errors.js';
const allowed=new Set(['tenantId','projectId','time_range','projects','environments','services','levels','query_text','trace_id','correlation_id','event_id','filters','sort','limit','cursor']);
/** Validate the existing canonical envelope before forwarding; Query remains authoritative for policy/field allowlists. */
export function validateSearchRequest(raw:unknown):Record<string,unknown>{
 const fail=():never=>{throw new InvalidArgumentException('Invalid log search filters.');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail();const d=raw as Record<string,any>;if(Object.keys(d).some(k=>!allowed.has(k)))fail();
 const t=d.time_range,utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
 if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['start','end'].includes(k))||![t.start,t.end].every(v=>typeof v==='string'&&utc.test(v)&&Number.isFinite(Date.parse(v)))||Date.parse(t.start)>=Date.parse(t.end))fail();
 if([t.start,t.end].some(v=>new Date(v).toISOString().slice(0,10)!==v.slice(0,10)))fail();
 const arrays:[string,number,RegExp|readonly string[]][]=[['projects',20,/^[a-z0-9_-]{1,64}$/],['services',20,/^[a-zA-Z0-9_.-]{1,64}$/],['environments',5,['production','staging','development','test','local']],['levels',6,['trace','debug','info','warn','error','fatal']]];
 for(const [key,max,rule]of arrays)if(d[key]!==undefined&&(!Array.isArray(d[key])||d[key].length>max||!d[key].every((v:unknown)=>typeof v==='string'&&(rule instanceof RegExp?rule.test(v):rule.includes(v)))))fail();
 for(const [key,max]of [['query_text',512],['cursor',1024],['tenantId',64],['projectId',64]] as const)if(d[key]!==undefined&&(typeof d[key]!=='string'||d[key].length>max))fail();
 if(d.correlation_id!==undefined&&(typeof d.correlation_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(d.correlation_id)))fail();
 if(d.trace_id!==undefined&&(typeof d.trace_id!=='string'||!/^[a-f0-9]{32}$/.test(d.trace_id)))fail();
 if(d.event_id!==undefined&&(typeof d.event_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.event_id)))fail();
 if(d.limit!==undefined&&(!Number.isInteger(d.limit)||d.limit<1||d.limit>500))fail();
 if(d.sort!==undefined&&(!d.sort||typeof d.sort!=='object'||Array.isArray(d.sort)||Object.keys(d.sort).some(k=>!['field','direction'].includes(k))||d.sort.field!==undefined&&d.sort.field!=='@timestamp'||d.sort.direction!==undefined&&!['asc','desc'].includes(d.sort.direction)))fail();
 if(d.filters!==undefined&&(!Array.isArray(d.filters)||d.filters.length>15||!d.filters.every((f:any)=>f&&typeof f==='object'&&!Array.isArray(f)&&Object.keys(f).every(k=>['field','operator','value'].includes(k))&&typeof f.field==='string'&&f.field.length<=128&&/^[@a-z0-9_.]+$/.test(f.field)&&['eq','neq','in','not_in','contains','exists','gt','gte','lt','lte'].includes(f.operator))))fail();
 return d;
}
