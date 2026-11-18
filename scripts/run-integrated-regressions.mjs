import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {root,testEnvironment,readState,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';import {verifyIntegratedMigrations} from './lib/integrated-migration-integrity.mjs';
const env=testEnvironment(readState()),c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await verifyIntegratedMigrations(c);await c.end();const physical=await isolatedAdminClient(readState());await physical.end();
const evidence=path.join(root,'.tmp/feature011-evidence'),legacy=path.join(root,'.tmp/feature011-regression-evidence'),quota=path.join(root,'.tmp/feature011-quota-evidence');fs.mkdirSync(legacy,{recursive:true});fs.mkdirSync(quota,{recursive:true});fs.mkdirSync(path.join(root,'.tmp/feature011-audit-evidence'),{recursive:true});
const auditOnly=process.argv.includes('--audit-only');const rerunLegacy=process.argv.includes('--rerun-legacy');const servicesOnly=process.argv.includes('--services-only'),quotaResume=process.argv.includes('--quota-and-services'),resume=servicesOnly||quotaResume||rerunLegacy||auditOnly,results=auditOnly?JSON.parse(fs.readFileSync(path.join(evidence,'regression-summary.json'))).filter(r=>!r.name.startsWith('audit-')&&!r.name.startsWith('developer-')):rerunLegacy?JSON.parse(fs.readFileSync(path.join(evidence,'regression-summary.json'))).filter(r=>!r.name.startsWith('legacy-')):resume?JSON.parse(fs.readFileSync(path.join(evidence,'regression-summary.json'))).filter(r=>r.name.startsWith('legacy-')||servicesOnly&&r.name.startsWith('quota-')):[];
function run(name,args,cwd=root,extra={}){const started=performance.now(),r=spawnSync(process.execPath,args,{cwd,env:{...env,...extra},windowsHide:true,encoding:'utf8',timeout:500000,maxBuffer:40*1024*1024}),output=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(evidence,name+'.log'),output);results.push({name,exitCode:r.status,durationMs:performance.now()-started,summary:output.split(/\r?\n/).filter(l=>/^(?:#|ℹ) (tests|pass|fail|skipped|cancelled)\b/.test(l))});fs.writeFileSync(path.join(evidence,'regression-summary.json'),JSON.stringify(results,null,2));console.log(name,r.status);if(r.status!==0)process.exit(1);}
const flags={SKYRA_FEATURE011_REGRESSIONS:'true',SKYRA_DEVELOPER_E2E:'true',SKYRA_PIPELINE_E2E:'true',SKYRA_EXPLORER_E2E:'true',SKYRA_ANALYTICS_E2E:'true',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature011-regression'};
if(!resume||rerunLegacy){
 run('legacy-sdk-pipeline',['--test','--test-reporter=tap','tests/credentials/feature005-pipeline.test.mjs'],root,flags);
 run('legacy-browser',['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'],root,flags);
}
if(process.argv.includes('--legacy-only'))process.exit(0);
if(!servicesOnly&&!auditOnly){
 run('quota-accounting',['--test','--test-reporter=tap','tests/quotas/quota-integration.test.mjs'],root,{SKYRA_QUOTA_EVIDENCE_LABEL:'feature011-quota'});
 run('quota-boundaries',['--test','--test-reporter=tap','tests/quotas/quota-boundaries.test.mjs'],root,{SKYRA_QUOTA_EVIDENCE_LABEL:'feature011-quota'});
 run('quota-browser',['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'],root,{SKYRA_QUOTA_E2E:'true',SKYRA_QUOTA_ONLY:'true',SKYRA_QUOTA_EVIDENCE_LABEL:'feature011-quota',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature011-quota'});
}
if(!auditOnly){
run('services',['scripts/run-explorer-regressions.mjs'],root,{SKYRA_REGRESSION_EVIDENCE_LABEL:'feature011'});
for(const app of ['console-bff','query-service'])run(app+'-compile',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.test.json'],path.join(root,'apps',app));
const bff=path.join(root,'apps/console-bff'),files=fs.readdirSync(path.join(bff,'dist-test/tests'),{recursive:true}).filter(p=>p.endsWith('.test.js')).map(p=>path.join(bff,'dist-test/tests',p));run('bff-tests',['--test','--test-reporter=tap',...files],bff);
run('console-tests',['--import','tsx','--test','tests/**/*.test.ts'],path.join(root,'apps/console-web'));
run('query-tests',['scripts/run-project-query-tests.mjs'],root,{QUERY_TEST_CONCURRENCY:'1'});
run('audit-hardening',['--test','--test-reporter=tap','tests/admin/postgres-hardening.test.mjs']);
run('credential-persistence',['--test','--test-reporter=tap','tests/credentials/persistence.test.mjs']);
}
run('audit-repository',['--test','--test-reporter=tap','tests/audit/persistence.test.mjs'],root,{SKYRA_AUDIT_EVIDENCE_LABEL:'feature011-audit'});
run('audit-migration-integrity',['scripts/verify-audit-migration.mjs'],root,{SKYRA_AUDIT_EVIDENCE_LABEL:'feature011-audit'});
run('audit-browser',['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'],root,{SKYRA_AUDIT_E2E:'true',SKYRA_AUDIT_ONLY:'true',SKYRA_AUDIT_EVIDENCE_LABEL:'feature011-audit',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature011-audit'});

run('developer-docs',['--test','--test-reporter=tap','tests/developer/documentation.test.mjs'],root,{SKYRA_SDK_EVIDENCE_LABEL:'feature011'});
run('developer-sample',['--test','--test-reporter=tap','tests/developer/sample.test.mjs'],root,{SKYRA_SDK_EVIDENCE_LABEL:'feature011'});
