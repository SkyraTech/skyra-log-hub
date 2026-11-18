import {BadRequestException} from '@nestjs/common';
export const USAGE_HISTORY_MAX_DAYS=90;
const day=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function usageHistoryRange(raw:Record<string,unknown>,now=Date.now()){
  if(Object.keys(raw).some(k=>!['start','end'].includes(k))||!day(raw.start)||!day(raw.end))throw new BadRequestException('Supply UTC start and exclusive end dates.');
  const start=Date.parse(raw.start),end=Date.parse(raw.end),days=(end-start)/86400000,tomorrow=Math.floor(now/86400000)*86400000+86400000;
  if(!Number.isInteger(days)||days<1||days>USAGE_HISTORY_MAX_DAYS||end>tomorrow)throw new BadRequestException('Use an increasing UTC history range of at most 90 days, ending no later than tomorrow.');
  return {start:raw.start,end:raw.end,days};
}
export function historyMetric(accepted:unknown,reserved:unknown,limit:unknown,enabled:boolean){
  const a=BigInt(String(accepted??0)),r=BigInt(String(reserved??0)),l=enabled&&limit!==null&&limit!==undefined?BigInt(String(limit)):null;
  return {accepted:a.toString(),reserved:r.toString(),historicalLimit:null,utilization:null,
    currentPolicyReference:{limit:l?.toString()??null,utilization:l===null||l===0n&&(a+r)>0n?null:l===0n?0:Number((a+r)*10000n/l)/100,
      capacity:l===null?'UNLIMITED':l===0n?'ZERO_LIMIT':a+r>=l?'EXHAUSTED':'AVAILABLE'}};
}
