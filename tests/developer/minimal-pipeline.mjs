import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
export async function verifyMinimalPipeline({root,evidence,service,principal,f,gateway,query}){
 const queryRead=async(url,options)=>{
  for(let attempt=0;attempt<2;attempt++)try{return await fetch(url,options);}catch(error){
   const code=error.cause?.code;
   fs.writeFileSync(path.join(evidence,'minimal-query-network.json'),JSON.stringify({attempt:attempt+1,code:typeof code==='string'?code:'unknown',operation:'read-only Query search'},null,2));
   if(attempt||!['UND_ERR_SOCKET','ECONNRESET','ECONNREFUSED'].includes(code))throw Error('Minimal read-only Query connection failed: '+(typeof code==='string'?code:'unknown'));
   await new Promise(r=>setTimeout(r,100));
  }
 };
 const consumer=JSON.parse(fs.readFileSync(path.join(process.env.SKYRA_FEATURE011_REGRESSIONS==='true'?path.join(root,'.tmp/feature011-evidence'):evidence,'consumer.json'))).directory,project=f.projects[3];
 const key=await service.create(principal('create'),f.tenantA,project,{description:'FEATURE010 minimal application',allowedEnvironments:['development']},crypto.randomUUID(),'feature010-minimal');
 try{
  const start=performance.now(),r=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['first-log.mjs'],{cwd:consumer,windowsHide:true,env:{PATH:process.env.PATH,SKYRA_PROJECT_ID:project,SKYRA_INGESTION_ENDPOINT:gateway.origin+'/ingest/v1/logs',SKYRA_INGESTION_CREDENTIAL:key.rawToken},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));});assert.equal(r.code,0,r.stderr);assert.ok(!r.stdout.includes(key.rawToken));const summary=JSON.parse(r.stdout);
  const events=gateway.frames().filter(frame=>frame.projectId===project&&frame.tenantId===f.tenantA).flatMap(frame=>JSON.parse(frame.payload.toString())).filter(e=>e.message.includes(summary.runId));assert.equal(events.length,6);assert.deepEqual(new Set(events.map(e=>e.log.level)),new Set(['trace','debug','info','warn','error','fatal']));assert.ok(events.every(e=>e.message.includes(summary.runId)&&e.service.name==='onboarding-sample'&&e.service.environment==='development'));
  const ids=events.map(e=>e.event.id).sort(),archive=path.join(gateway.storeRoot,'archive');let archived=[];
  for(let i=0;i<80;i++){archived=fs.readdirSync(archive,{recursive:true}).filter(p=>p.endsWith('.jsonl')).flatMap(p=>fs.readFileSync(path.join(archive,p),'utf8').trim().split('\n').map(JSON.parse)).filter(e=>e.skyra.project_id===project&&e.message.includes(summary.runId));if(archived.length===6)break;await new Promise(r=>setTimeout(r,100));}assert.deepEqual(archived.map(e=>e.event.id).sort(),ids);
  const body={time_range:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+60000).toISOString()},projects:[project],query_text:summary.runId},response=await queryRead(query.origin+'/query/v1/logs/search',{method:'POST',headers:{Authorization:'Bearer '+query.token(f.tenantA,project),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.events.map(e=>e.event.id).sort(),ids);for(const expected of archived)assert.deepEqual(result.events.find(e=>e.event.id===expected.event.id),expected);
  fs.writeFileSync(path.join(evidence,'minimal-continuity.json'),JSON.stringify({project,runId:summary.runId,expected:archived,walIds:ids,archiveIds:archived.map(e=>e.event.id).sort(),queryIds:result.events.map(e=>e.event.id).sort(),startupThroughQueryMs:performance.now()-start,flushMs:summary.flushMs},null,2));
 }finally{const current=await service.read(principal('read'),f.tenantA,project,key.id);await service.revoke(principal('revoke'),f.tenantA,project,key.id,{},current.version,'feature010-minimal-revoke');}
}
