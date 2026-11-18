import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {root,testEnvironment,readState,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';
const env=testEnvironment(readState()),c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await c.end();const physical=await isolatedAdminClient(readState());await physical.end();
const evidence=path.join(root,'.tmp/feature008-evidence'),legacy=path.join(root,'.tmp/feature008-regression-evidence');fs.mkdirSync(legacy,{recursive:true});const resume=process.argv.includes('--services-only');const results=resume?JSON.parse(fs.readFileSync(path.join(evidence,'all-regressions.json'))).filter(r=>r.name.startsWith('legacy-')):[];
function run(name,args,cwd=root,extra={}){
 const r=spawnSync(process.execPath,args,{cwd,env:{...env,...extra},windowsHide:true,encoding:'utf8',timeout:500000,maxBuffer:30*1024*1024});const output=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(evidence,name+'.log'),output);results.push({name,exitCode:r.status,summary:output.split(/\r?\n/).filter(l=>/^(?:#|ℹ) (tests|pass|fail|skipped|cancelled)\b/.test(l))});fs.writeFileSync(path.join(evidence,'all-regressions.json'),JSON.stringify(results,null,2));console.log(name,r.status);if(r.status!==0)process.exit(1);
}
const flags={SKYRA_QUOTA_REGRESSIONS:'true',SKYRA_PIPELINE_E2E:'true',SKYRA_EXPLORER_E2E:'true',SKYRA_ANALYTICS_E2E:'true',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature008-regression'};
if(!resume)run('legacy-sdk-pipeline',['--test','--test-reporter=tap','tests/credentials/feature005-pipeline.test.mjs'],root,flags);
if(!resume)run('legacy-browser-full',['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'],root,flags);
run('service-regressions',['scripts/run-explorer-regressions.mjs'],root,{SKYRA_REGRESSION_EVIDENCE_LABEL:'feature008'});
for(const app of ['console-bff','query-service'])run(app+'-test-compile',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.test.json'],path.join(root,'apps',app));
const bff=path.join(root,'apps/console-bff');const files=fs.readdirSync(path.join(bff,'dist-test/tests'),{recursive:true}).filter(f=>f.endsWith('.test.js')).map(f=>path.join(bff,'dist-test/tests',f));run('bff-tests',['--test',...files],bff);
run('console-tests',['--import','tsx','--test','tests/**/*.test.ts'],path.join(root,'apps/console-web'));
run('query-tests',['scripts/run-project-query-tests.mjs'],root,{QUERY_TEST_CONCURRENCY:'1'});

run('credential-persistence',['--test','--test-reporter=tap','tests/credentials/persistence.test.mjs']);
