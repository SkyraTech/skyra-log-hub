import {createSkyraLogger,HttpTransport} from '@skyra/logger-node';
/** Public packaged SDK only. Every event identifier and canonical record is produced by the SDK. */
export async function emitAnalyticsCohort({endpoint,credential,projectId,records}){
 const expected=[],statuses=[],diagnostics=[],groups=new Map();
 for(const r of records){const key=r.service+'/'+r.environment+'/'+r.cohort;const group=groups.get(key)??[];group.push(r);groups.set(key,group);}
 for(const group of groups.values()){
  let occurrence=group[0].timestamp;class Observed extends HttpTransport{async write(level,line,bytes){expected.push(JSON.parse(line));return super.write(level,line,bytes);}}
  const transport=new Observed({endpoint,credential,retryBaseDelayMs:20,retryJitter:0,retryBudgetMs:10000,onDiagnostic:d=>diagnostics.push(d)}),logger=createSkyraLogger({projectId,serviceName:group[0].service,environment:group[0].environment,instanceId:'advanced-analytics',level:'trace',validationMode:'strict',clock:()=>new Date(occurrence)},transport);
  for(const r of group){occurrence=r.timestamp;logger[r.level](r.message,{traceId:r.traceId,...(r.correlationId===undefined?{}:{correlationId:r.correlationId}),labels:{run:r.run,cohort:r.cohort},attributes:{workflow:{step:r.sequence},unicode:'తెలుగు 🌍'}});}
  await logger.flush();await logger.close();const status=logger.getStatus();if(status.totalEventsDropped||status.totalEventsWritten!==group.length)throw Error('SDK cohort incomplete');statuses.push(status);
 }
 return {expected,statuses,diagnostics};
}
