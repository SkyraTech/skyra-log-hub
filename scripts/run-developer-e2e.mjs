import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';import {verifyAuditMigration} from './lib/audit-migration-integrity.mjs';
const env=testEnvironment(readState()),c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await verifyAuditMigration(c);await c.end();const physical=await isolatedAdminClient(readState());await physical.end();
const evidence=path.join(root,'.tmp/feature010-evidence');
const flags={SKYRA_DEVELOPER_ONLY:process.argv.includes('--focused')?'true':'false',SKYRA_DEVELOPER_E2E:'true',SKYRA_PIPELINE_E2E:'true',SKYRA_EXPLORER_E2E:'true',SKYRA_ANALYTICS_E2E:'true',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature010'};
const args=['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'];
const r=spawnSync(process.execPath,args,{cwd:root,env:{...env,...flags},windowsHide:true,encoding:'utf8',timeout:500000,maxBuffer:30*1024*1024});fs.writeFileSync(path.join(evidence,process.argv.includes('--focused')?'browser-focused.log':'browser.log'),(r.stdout??'')+(r.stderr??''));console.log('Developer browser exit:',r.status);process.exit(r.status??1);
