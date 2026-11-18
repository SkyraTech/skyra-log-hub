import {InvalidArgumentException} from '../../../common/errors/query.errors.js';
export const DASHBOARD_WIDTHS:Record<string,number>={'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'6h':21600000,'1d':86400000};
export function dashboardInput(raw:unknown,validate:(v:any)=>any){
 const fail=():never=>{throw new InvalidArgumentException('Invalid dashboard scope, filters or resource limit.');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw))>4096)fail();const d=raw as Record<string,any>;
 if(Object.keys(d).some(k=>!['projects','time_range','interval','top_n','environments','services','levels','correlation_id'].includes(k))||!Array.isArray(d.projects)||d.projects.length!==1)fail();
 const interval=d.interval??'5m',width=DASHBOARD_WIDTHS[interval]??0,top=d.top_n??5;
 if(typeof interval!=='string'||typeof width!=='number'||width<=0||!Number.isInteger(top)||top<1||top>10)fail();
 if(d.correlation_id!==undefined&&(typeof d.correlation_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(d.correlation_id)))fail();
 const base=validate({projects:d.projects,time_range:d.time_range,...(d.environments?{environments:d.environments}:{}),...(d.services?{services:d.services}:{}),...(d.levels?{levels:d.levels}:{}),...(d.correlation_id?{filters:[{field:'correlation.id',operator:'eq',value:d.correlation_id}]}:{}),aggregations:[{name:'volume_over_time',type:'date_histogram',field:'@timestamp',interval}]});
 const start=Date.parse(base.time_range.start),end=Date.parse(base.time_range.end);
 if(end-start>7*86400000||Math.floor((end-1)/width)-Math.floor(start/width)+1>240||!Number.isFinite(start-(end-start)))fail();
 return {base,interval:interval as '1m'|'5m'|'15m'|'1h'|'6h'|'1d',width,top,filters:{...(d.environments?{environments:d.environments}:{}),...(d.services?{services:d.services}:{}),...(d.levels?{levels:d.levels}:{}),...(d.correlation_id?{correlation_id:d.correlation_id}:{})}};
}
