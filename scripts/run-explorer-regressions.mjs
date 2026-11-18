import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';
import {connectIsolatedClient} from './lib/isolated-target.mjs';

// All service test processes inherit only the provisioner-verified disposable target.
const env=testEnvironment(readState());
const client=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await client.end();
const physical=await isolatedAdminClient(readState());await physical.end();
const label=process.env.SKYRA_REGRESSION_EVIDENCE_LABEL??'feature006';if(!/^(?:dev01[2345678]|feature(?:00[6789]|01[01]))$/.test(label))throw Error('Invalid regression evidence label');
const evidence=path.join(root,'.tmp/'+label+'-evidence'),results=[];
function run(name,cwd,args){
 const start=performance.now();
 const result=spawnSync(process.execPath,args,{cwd,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(evidence,name+'.log'),output);
 results.push({name,exitCode:result.status,durationMs:performance.now()-start,summary:output.split(/\r?\n/).filter(l=>/^(?:#|ℹ) (tests|pass|fail|skipped|cancelled)\b/.test(l))});
 fs.writeFileSync(path.join(evidence,'regressions.json'),JSON.stringify(results,null,2));
 console.log(name,result.status);if(result.status!==0)process.exit(1);
}
for(const app of ['ingestion-gateway','admin-service']){
 const cwd=path.join(root,'apps',app);
 run(app+'-compile',cwd,[path.join(root,'node_modules/typescript/bin/tsc'),'--project','tsconfig.test.json']);
 const tests=fs.readdirSync(path.join(cwd,'dist-test'),{recursive:true}).filter(p=>p.endsWith('.test.js')).map(p=>path.join(cwd,'dist-test',p));
 run(app+'-tests',cwd,['--test',...tests]);
}
run('sdk-node-tests',path.join(root,'packages/logger-node'),['--import','tsx','--test','tests/**/*.test.ts']);
run('contract-tests',root,['--import','tsx','--test','tests/contracts/**/*.test.ts']);
run('target-guards',root,['--test','tests/admin/isolated-target.test.mjs']);
run('design-governance',root,['scripts/verify-design-system-governance.cjs']);
run('schema-sync',root,['scripts/sync-schemas.mjs','--check']);
