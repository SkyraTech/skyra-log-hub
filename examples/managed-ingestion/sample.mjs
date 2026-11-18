import {createSkyraLogger,HttpTransport} from '../../packages/logger-node/dist/index.js';

/** Uses the supported public Node SDK API; credential stays in process memory. */
export async function runSample({endpoint,credential,projectId,runId,rounds=1,serviceName='feature005-sample',environment='production',traceId='a'.repeat(32),clock,correlationId,retryOptions={}}){
  const expected=[];
  class ObservedTransport extends HttpTransport {
    async write(level,line,bytes){expected.push(JSON.parse(line));await super.write(level,line,bytes);}
  }
  const diagnostics=[];const transport=new ObservedTransport({endpoint,credential,...retryOptions,onDiagnostic:d=>diagnostics.push(d)}),logger=createSkyraLogger({projectId,serviceName,environment,...(clock?{clock}:{} ),instanceId:'sample',level:'debug',validationMode:'strict'},transport);
  const started=performance.now();
  let sequence=0;for(let round=0;round<rounds;round++)for(const level of ['debug','info','warn','error','fatal'])logger[level](`${runId} event-${sequence++} ${level} తెలుగు 🌍 ${'long valid message '.repeat(20)}`,{...(correlationId?{correlationId}:{}),traceId,spanId:'b'.repeat(16),labels:{run_id:runId},attributes:{order:{id:42},values:[true,7,'Unicode 🌍']}});
  await logger.flush();await logger.close();
  return {expected,diagnostics,submissionMs:performance.now()-started,status:logger.getStatus()};
}
