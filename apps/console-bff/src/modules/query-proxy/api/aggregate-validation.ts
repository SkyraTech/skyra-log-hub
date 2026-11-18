import {InvalidArgumentException} from '../../../common/errors/bff.errors.js';
import {validateSearchRequest} from './search-validation.js';
const widths:Record<string,number>={'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'6h':21600000,'1d':86400000};
export function validateAggregateRequest(body:Record<string,unknown>):Record<string,unknown>{
 if(Object.keys(body).some(k=>!['time_range','projects','projectId','environments','services','levels','query_text','filters','aggregations','include_empty_buckets'].includes(k)))throw new InvalidArgumentException('Unsupported analytics property.');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new InvalidArgumentException('Analytics body must be a JSON object.');
 const {aggregations,include_empty_buckets,...base}=body;
 validateSearchRequest(base);
 const fail=():never=>{throw new InvalidArgumentException('Invalid analytics aggregation or bucket limit.');};
 if(include_empty_buckets!==undefined&&typeof include_empty_buckets!=='boolean')fail();
 if(!Array.isArray(aggregations)||!aggregations.length||aggregations.length>5)fail();
 const names=new Set<string>(),range=base.time_range as {start:string;end:string};
 for(const value of aggregations as unknown[]){
  if(!value||typeof value!=='object'||Array.isArray(value))fail();const a=value as Record<string,any>;
  if(Object.keys(a).some(k=>!['name','type','field','size','interval'].includes(k))||typeof a.name!=='string'||!/^[a-zA-Z0-9_]{1,32}$/.test(a.name)||['__proto__','constructor','prototype'].includes(a.name)||names.has(a.name))fail();names.add(a.name);
  if(!['date_histogram','terms','cardinality'].includes(a.type)||typeof a.field!=='string'||a.field.length>128||!/^[@a-z0-9_.]+$/.test(a.field))fail();
  if(a.type==='date_histogram'){
   const width=widths[a.interval];if(!['@timestamp','timestamp'].includes(a.field)||typeof width!=='number'||Math.floor((Date.parse(range.end)-1)/width)-Math.floor(Date.parse(range.start)/width)+1>2000)fail();
  }
  if(a.size!==undefined&&(!Number.isInteger(a.size)||a.size<1||a.size>50))fail();
 }
 return body;
}
