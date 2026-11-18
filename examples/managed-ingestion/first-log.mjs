import {randomUUID} from 'node:crypto';
import {createSkyraLogger,HttpTransport,IngestionError} from '@skyra/logger-node';

const required=['SKYRA_INGESTION_ENDPOINT','SKYRA_INGESTION_CREDENTIAL','SKYRA_PROJECT_ID'];
if(required.some(key=>!process.env[key])){
  console.error('Missing configuration: set SKYRA_INGESTION_ENDPOINT, SKYRA_INGESTION_CREDENTIAL and SKYRA_PROJECT_ID.');
  process.exitCode=1;
}else{
  try{
    const runId=randomUUID(),workflowId='order-'+randomUUID();
    const transport=new HttpTransport({endpoint:process.env.SKYRA_INGESTION_ENDPOINT,credential:process.env.SKYRA_INGESTION_CREDENTIAL});
    const logger=createSkyraLogger({projectId:process.env.SKYRA_PROJECT_ID,serviceName:'onboarding-sample',environment:'development',instanceId:'sample',level:'trace',validationMode:'strict'},transport);
    const started=performance.now();
    for(const level of ['trace','debug','info','warn','error','fatal'])logger[level](`Onboarding ${runId} ${level}`,{correlationId:workflowId,traceId:runId.replaceAll('-',''),spanId:'1234567890abcdef',labels:{run_id:runId},attributes:{order:{id:42},sample:true}});
    await logger.flush();
    const status=logger.getStatus();
    await logger.close();
    if(status.totalEventsDropped||status.totalEventsWritten!==6)throw Error('Incomplete submission');
    console.log(JSON.stringify({runId,acceptedEvents:status.totalEventsWritten,flushMs:Math.round(performance.now()-started),service:'onboarding-sample',environment:'development',message:'Durably admitted. Open Explorer, select this project, use a recent time range and search this runId. Query visibility follows archive publication.'}));
  }catch(error){
    // Never print configuration, fetch causes, tokens or untrusted Gateway bodies.
    if(error instanceof IngestionError)console.error(JSON.stringify({code:error.code,status:error.httpStatus,attempt:error.attempt,outcome:error.outcome,batchId:error.batchId}));
    console.error('Sample failed. Check configuration, credential scope, Gateway availability and quota. No delivery success is claimed.');
    process.exitCode=1;
  }
}
