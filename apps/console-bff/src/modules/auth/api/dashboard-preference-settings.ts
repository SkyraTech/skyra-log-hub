import {BadRequestException} from '@nestjs/common';
export const DASHBOARD_DEFAULTS=Object.freeze({v:1,range:'1h',refreshSeconds:0,service:'',interval:'5m',topN:5,metric:'events'});
export function preferenceSettings(raw:unknown){
 const fail=():never=>{throw new BadRequestException('Invalid dashboard preferences.');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw))>2048)fail();const d=raw as Record<string,any>;
 if(Object.keys(d).length!==7||Object.keys(d).some(k=>!Object.hasOwn(DASHBOARD_DEFAULTS,k))||d.v!==1||!['15m','1h','6h','24h','7d'].includes(d.range)||![0,15,30,60,300].includes(d.refreshSeconds)||typeof d.service!=='string'||d.service!==''&&!/^[A-Za-z0-9_.-]{1,64}$/.test(d.service)||!['1m','5m','15m','1h','6h','1d'].includes(d.interval)||!Number.isInteger(d.topN)||d.topN<1||d.topN>10||!['events','errors','warnings'].includes(d.metric))fail();
 const widths:Record<string,number>={'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'6h':21600000,'1d':86400000},ranges:Record<string,number>={'15m':900000,'1h':3600000,'6h':21600000,'24h':86400000,'7d':604800000};
 if(Math.ceil(ranges[d.range]!/widths[d.interval]!)+1>240)fail();
 return {v:1,range:String(d.range),refreshSeconds:Number(d.refreshSeconds),service:String(d.service),interval:String(d.interval),topN:Number(d.topN),metric:String(d.metric)};
}
