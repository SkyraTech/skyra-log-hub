import {BadRequestException} from '@nestjs/common';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function savedFilters(raw:unknown){
 const fail=():never=>{throw new BadRequestException('Invalid saved filter configuration.');};
 if(!object(raw)||Object.keys(raw).some(k=>!['v','range','queryText','levels','services','environments','traceId','correlationId'].includes(k))||raw.v!==1)fail();
 const d=raw as Record<string,any>,range=d.range;
 if(!object(range))fail();
 let time:Record<string,string>;
 if(range.kind==='relative'&&Object.keys(range).length===2&&['15m','1h','6h','24h','7d'].includes(range.preset))time={kind:'relative',preset:range.preset};
 else if(range.kind==='absolute'&&Object.keys(range).length===3&&['start','end'].every(k=>typeof range[k]==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(range[k])&&Number.isFinite(Date.parse(range[k]))&&new Date(range[k]).toISOString().slice(0,10)===range[k].slice(0,10))&&Date.parse(range.start)<Date.parse(range.end)&&Date.parse(range.end)-Date.parse(range.start)<=7*86400000)time={kind:'absolute',start:new Date(range.start).toISOString(),end:new Date(range.end).toISOString()};else fail();
 const out:Record<string,any>={v:1,range:time!};
 if(d.queryText!==undefined){if(typeof d.queryText!=='string'||d.queryText.length>512||/[\x00-\x1f\x7f]/.test(d.queryText))fail();out.queryText=d.queryText;}
 for(const [key,max,rule]of [['levels',6,['trace','debug','info','warn','error','fatal']],['services',20,/^[a-zA-Z0-9_.-]{1,64}$/],['environments',5,['production','staging','development','test','local']]] as const){if(d[key]!==undefined){if(!Array.isArray(d[key])||d[key].length>max||!d[key].every((v:unknown)=>typeof v==='string'&&(rule instanceof RegExp?rule.test(v):(rule as readonly string[]).includes(v))))fail();out[key]=[...new Set(d[key])].sort();}}
 if(d.traceId!==undefined){if(typeof d.traceId!=='string'||!/^[a-f0-9]{32}$/.test(d.traceId))fail();out.traceId=d.traceId;}
 if(d.correlationId!==undefined){if(typeof d.correlationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(d.correlationId))fail();out.correlationId=d.correlationId;}
 if(Buffer.byteLength(JSON.stringify(out))>8192)fail();return out;
}
export function savedInput(raw:unknown){if(!object(raw)||Object.keys(raw).some(k=>!['name','description','visibility','filters'].includes(k)))throw new BadRequestException('Invalid saved search fields.');
 const text=(v:unknown,max:number,required=false)=>{if(typeof v!=='string'||v.trim().length>(max)||required&&!v.trim()||/[\x00-\x1f\x7f]/.test(v))throw new BadRequestException('Invalid saved search name or description.');return v.trim();};
 if(!['PRIVATE','PROJECT'].includes(raw.visibility))throw new BadRequestException('Select private or project sharing.');return {name:text(raw.name,120,true),description:text(raw.description??'',500),visibility:raw.visibility as 'PRIVATE'|'PROJECT',filters:savedFilters(raw.filters)};
}
