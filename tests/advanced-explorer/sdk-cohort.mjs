import {createSkyraLogger,HttpTransport} from '@skyra/logger-node';
/** Independently installed public SDK, with deterministic field cohorts and SDK-generated stable event UUIDs. */
export async function emitAdvancedCohort({endpoint,credential,projectId,records,timestamp}){
 const expected=[],diagnostics=[],statuses=[];const groups=new Map();for(const record of records){const list=groups.get(record.service)??[];list.push(record);groups.set(record.service,list);}
 for(const [service,list]of groups){class Observed extends HttpTransport{async write(level,line,bytes){expected.push(JSON.parse(line));return super.write(level,line,bytes);}}
 const transport=new Observed({endpoint,credential,onDiagnostic:d=>diagnostics.push(d)}),logger=createSkyraLogger({projectId,serviceName:service,environment:'production',instanceId:'advanced-explorer',level:'trace',validationMode:'strict',clock:()=>new Date(timestamp)},transport);
 for(const r of list)logger[r.level??'info'](r.message,{traceId:r.traceId??'a'.repeat(32),...(r.correlationId!==undefined?{correlationId:r.correlationId}:{}),labels:{cohort:r.cohort??'primary',sequence:String(r.sequence??0)},attributes:{nested:{value:'తెలుగు 🌍'},sample:true}});
 await logger.flush();await logger.close();const status=logger.getStatus();if(status.totalEventsDropped||status.totalEventsWritten!==list.length)throw Error('Cohort delivery incomplete');statuses.push(status);}
 return {expected,diagnostics,statuses};
}
