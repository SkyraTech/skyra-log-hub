import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {runSample} from '../../examples/managed-ingestion/sample.mjs';
export async function ingestAnalyticsCohort({owner,f,service,principal,otherIssued,gateway,evidence}){
 const start=Math.floor(Date.now()/60000)*60000-8*60000,end=start+4*60000,runId='analytics-'+crypto.randomUUID();
 const project=f.projects[1],otherProject=f.projects[2];
 const plan=[
  {serviceName:'analytics-alpha',environment:'production',at:start,rounds:8},
  {serviceName:'analytics-alpha',environment:'production',at:start+120000,rounds:4},
  {serviceName:'analytics-beta',environment:'staging',at:start+60000,rounds:6},
  {serviceName:'analytics-beta',environment:'staging',at:end,rounds:2},
  {serviceName:'analytics-gamma',environment:'development',at:start-1,rounds:1},
  {serviceName:'analytics-gamma',environment:'development',at:start,rounds:1},
 ];
 fs.writeFileSync(path.join(evidence,'analytics-ingestion-plan.json'),JSON.stringify({runId,project,otherProject,time_range:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},plan,expectedPrimaryTotal:95,expectedErrorCount:38,expectedWarningCount:19,expectedSeverityEach:19,expectedServiceCounts:{'analytics-alpha':60,'analytics-beta':30,'analytics-gamma':5},expectedEnvironmentCounts:{production:60,staging:30,development:5},expectedBuckets:[45,30,20,0],expectedOtherProject:20,expectedForeign:5},null,2));
 const expected=[],otherExpected=[];
 for(const [target,entries] of [[project,plan],[otherProject,[{serviceName:'analytics-other',environment:'test',at:start+60000,rounds:4}]]]){
  const credential=await service.create(principal('create'),f.tenantA,target,{description:'Feature007 isolated analytics cohort',allowedEnvironments:['production','staging','development','test']},crypto.randomUUID(),'feature007-create');
  try{for(const entry of entries){const result=await runSample({endpoint:gateway.origin+'/ingest/v1/logs',credential:credential.rawToken,projectId:target,runId,rounds:entry.rounds,serviceName:entry.serviceName,environment:entry.environment,clock:()=>new Date(entry.at)});(target===project?expected:otherExpected).push(...result.expected);}}
  finally{const row=await service.read(principal('read'),f.tenantA,target,credential.id);await service.revoke(principal('revoke'),f.tenantA,target,credential.id,{},row.version,'feature007-revoke');}
 }
 const foreign=await runSample({endpoint:gateway.origin+'/ingest/v1/logs',credential:otherIssued.rawToken,projectId:f.projectB,runId,serviceName:'analytics-foreign',clock:()=>new Date(start+60000)});
 const wanted=[...expected,...otherExpected,...foreign.expected].map(e=>e.event.id).sort();
 // Wait for both files and catalog publication before stopping the real Gateway process.
 let archived=[];
 for(let attempt=0;attempt<100;attempt++){
  const rows=(await owner.query('SELECT * FROM archive_segments WHERE tenant_id=ANY($1::text[])',[ [f.tenantA,f.tenantB] ])).rows;
  archived=rows.flatMap(r=>{const file=path.join(gateway.storeRoot,'archive',r.tenant_id,r.project_id,r.environment,r.service_name,r.date,r.segment_filename);return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.message.includes(runId)):[];});
  if(archived.length===wanted.length)break;await new Promise(r=>setTimeout(r,100));
 }
 if(JSON.stringify(archived.map(e=>e.event.id).sort())!==JSON.stringify(wanted))throw Error('Actual analytics archive publication did not reconcile');
 fs.writeFileSync(path.join(evidence,'analytics-cohort.json'),JSON.stringify({runId,project,otherProject,time_range:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},expected,otherExpected,foreignExpected:foreign.expected,archivedIds:archived.map(e=>e.event.id)},null,2));
}
