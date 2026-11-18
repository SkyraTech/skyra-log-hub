import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';import {verifyIntegratedMigrations} from './lib/integrated-migration-integrity.mjs';import {sessionTestEnvironment} from './lib/session-test-runtime.mjs';
const dir=path.join(root,'.tmp/dev018-evidence');fs.mkdirSync(dir,{recursive:true});const mode=process.argv[2]??'sdk',results=[];
let env={...process.env,SKYRA_SDK_EVIDENCE_LABEL:'dev018',SKYRA_SESSION_TEST_LABEL:'dev018'};
if(mode!=='sdk'){env={...env,...testEnvironment(readState())};const c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await verifyIntegratedMigrations(c);await c.end();const physical=await isolatedAdminClient(readState());await physical.end();await sessionTestEnvironment();}
const run=(name,args,cwd=root,extra={},runtime=process.execPath)=>{const start=performance.now(),r=spawnSync(runtime,args,{cwd,env:{...env,...extra},windowsHide:true,encoding:'utf8',timeout:1200000,maxBuffer:40e6});const output=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(dir,name+'.log'),output);results.push({name,runtime,argv:args,cwd,exit:r.status,ms:performance.now()-start,error:r.error?.code});fs.writeFileSync(path.join(dir,mode+'-results.json'),JSON.stringify(results,null,2));console.log(name,r.status);if(r.status!==0)process.exit(r.status??1);};
if(mode==='sdk'){
 run('sdk-build',['node_modules/typescript/bin/tsc','-p','packages/logger-node/tsconfig.json']);
 for(const [suffix,runtime] of [['24',process.execPath],['22',path.join(dir,'runtime22/node.exe')]]){
 run('sdk-tests'+suffix,['--import','tsx','--test','--test-reporter=tap','packages/logger-node/tests/**/*.test.ts'],root,{},runtime);
 run('core-contracts'+suffix,['--import','tsx','--test','--test-reporter=tap','tests/contracts/**/*.test.ts'],root,{},runtime);
 }
}else if(mode==='lifecycle'){
 for(const file of ['gateway-lifecycle','app-exit'])run('sdk-'+file,['--test','--test-reporter=tap','tests/sdk-reliability/'+file+'.test.mjs']);
}else if(mode==='sessions'){
 for(const name of ['migration','persistence','http-security','outage-recovery','cleanup-recovery'])run('session-'+name,['--test','--test-reporter=tap','tests/sessions/'+name+'.test.mjs']);
}else if(mode==='browser'||mode==='focused'||mode==='explorer'){
 for(const app of ['admin-service','console-bff','ingestion-gateway','query-service'])run('browser-'+app+'-build',['node_modules/typescript/bin/tsc','-p','apps/'+app+'/tsconfig.json']);
 run('integrated-browser-run',['scripts/run-integrated-acceptance.mjs'],root,{SKYRA_FINAL_ACCEPTANCE_E2E:'true',SKYRA_AUDIT_USAGE_E2E:'true',SKYRA_ADVANCED_ANALYTICS_E2E:'true',SKYRA_ADVANCED_EXPLORER_E2E:'true',SKYRA_SDK_RELIABILITY_E2E:'true',SKYRA_SESSION_E2E:'true',SKYRA_SESSION_TEST_LABEL:'dev018',...(mode==='focused'?{SKYRA_ANALYTICS_FOCUSED:'true',SKYRA_AUDIT_USAGE_ONLY:'true'}:mode==='explorer'?{SKYRA_ANALYTICS_FOCUSED:'true',SKYRA_AUDIT_USAGE_ONLY:'true',SKYRA_EXPLORER_FOCUSED:'true',SKYRA_FINAL_EXPLORER_ONLY:'true'}:{})});
}else if(mode==='regressions'){
 run('service-regressions',['scripts/run-explorer-regressions.mjs'],root,{SKYRA_REGRESSION_EVIDENCE_LABEL:'dev018'});
 for(const app of ['console-bff','query-service'])run(app+'-compile',['node_modules/typescript/bin/tsc','-p','apps/'+app+'/tsconfig.test.json']);
 const cwd=path.join(root,'apps/console-bff'),files=fs.readdirSync(path.join(cwd,'dist-test/tests'),{recursive:true}).filter(p=>p.endsWith('.test.js')).map(p=>path.join(cwd,'dist-test/tests',p));run('bff-tests',['--test','--test-reporter=tap',...files],cwd,{SESSION_STORE_BACKEND:'memory-test'});
 run('console-tests',['--import','tsx','--test','--test-reporter=tap','tests/**/*.test.ts'],path.join(root,'apps/console-web'));
 run('query-tests',['scripts/run-project-query-tests.mjs'],root,{QUERY_TEST_CONCURRENCY:'1'});
 for(const label of ['quota','audit','storage'])fs.mkdirSync(path.join(root,'.tmp/dev018-'+label+'-evidence'),{recursive:true});
 for(const name of ['quota-integration','quota-boundaries'])run(name,['--test','--test-reporter=tap','tests/quotas/'+name+'.test.mjs'],root,{SKYRA_QUOTA_EVIDENCE_LABEL:'dev018-quota'});
 for(const name of ['postgres-hardening','credentials/persistence','audit/persistence']){const file=name==='postgres-hardening'?'admin/'+name:name;run(file.replaceAll('/','-'),['--test','--test-reporter=tap','tests/'+file+'.test.mjs'],root,{SKYRA_AUDIT_EVIDENCE_LABEL:'dev018-audit'});}
 for(const name of ['documentation','sample'])run('developer-'+name,['--test','--test-reporter=tap','tests/developer/'+name+'.test.mjs']);
 for(const name of ['lifecycle.test','ownership.test','database-restart'])run('storage-'+name,['--test','--test-reporter=tap','tests/storage/'+name+'.mjs'],root,{SKYRA_STORAGE_EVIDENCE_LABEL:'dev018-storage'});
}else throw Error('Unknown verification mode');
