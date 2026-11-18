import fs from 'node:fs';import path from 'node:path';import {fork} from 'node:child_process';import crypto from 'node:crypto';
import {root,readState,testEnvironment,isolatedAdminClient} from '../../scripts/isolated-postgres.mjs';
import {connectIsolatedClient,connectIsolatedIngestionRuntimeClient} from '../../scripts/lib/isolated-target.mjs';
export async function quotaGateway(evidence,options={}){
  const state=readState(),env=testEnvironment(state),owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await owner.end();const physical=await isolatedAdminClient(state);await physical.end();
  const privateState=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature004-postgres/gateway-runtime.json')));if(privateState.clusterId!==state.clusterId)throw Error('Unverified runtime');
  const url=new URL(env.ISOLATED_DATABASE_URL);url.username='skyra_ingestion_runtime';url.password=privateState.password;
  const checked=await connectIsolatedIngestionRuntimeClient(url.href,env);await checked.end();
  const parent=path.join(root,'.tmp');if(fs.lstatSync(parent).isSymbolicLink())throw Error('Redirected store');
  const store=options.store??fs.mkdtempSync(path.join(parent,'feature008-ingestion-'));
  if(!options.store){fs.writeFileSync(path.join(store,'ownership.json'),JSON.stringify({clusterId:state.clusterId,id:crypto.randomUUID()}),{flag:'wx'});fs.mkdirSync(path.join(store,'wal'));fs.mkdirSync(path.join(store,'archive'));}
  if(fs.lstatSync(store).isSymbolicLink()||!fs.realpathSync(store).startsWith(fs.realpathSync(parent)+path.sep)||JSON.parse(fs.readFileSync(path.join(store,'ownership.json'))).clusterId!==state.clusterId)throw Error('Unowned quota store');
  const fd=fs.openSync(path.join(evidence,'gateway-'+crypto.randomUUID()+'.log'),'w');
  const child=fork(path.join(root,'tests/quotas/gateway-child.mjs'),[],{cwd:store,windowsHide:true,env:{...env,NODE_ENV:'test',DATABASE_URL:url.href,WAL_DIRECTORY:path.join(store,'wal'),...(options.maxSegmentBytes?{WAL_MAX_SEGMENT_BYTES:String(options.maxSegmentBytes)}:{}),ARCHIVE_ROOT:path.join(store,'archive'),INGESTION_PUBLISH_ARCHIVES:'true',INGESTION_QUOTAS_ENABLED:'true',FIXTURE_NOW:options.now??'',FIXTURE_PAUSE:options.pause??'',FIXTURE_THROW:options.throw??'',FIXTURE_METRICS:options.metrics?'true':'false'},stdio:['ignore',fd,fd,'ipc']});fs.closeSync(fd);
  const messages=[];child.on('message',m=>messages.push(m));
  const until=async predicate=>{for(let i=0;i<200;i++){const m=messages.find(predicate);if(m)return m;if(child.exitCode!==null)throw Error('Quota Gateway exited; inspect isolated log');await new Promise(r=>setTimeout(r,50));}throw Error('Quota Gateway fixture timeout');};
  let ready;try{ready=await until(m=>m.ready||options.startupFault&&m.fault);}catch(e){child.kill();throw e;}
  return {origin:ready.ready,store,child,messages,until,clock:async at=>{child.send({clock:at});await until(m=>m.clock===at);},stop:async()=>{if(child.exitCode!==null||child.signalCode)return;const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}};
}
