import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';
import {connectIsolatedClient} from './lib/isolated-target.mjs';
const env=testEnvironment(readState()),client=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await client.end();const physical=await isolatedAdminClient(readState());await physical.end();
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/organization/organization.e2e.mjs'],{cwd:root,windowsHide:true,env:{...env,SKYRA_PIPELINE_E2E:'true',SKYRA_EXPLORER_E2E:'true',SKYRA_ANALYTICS_E2E:'true',SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature007'},stdio:'inherit',timeout:500000});if(result.status!==0)console.error('Browser process result',JSON.stringify({status:result.status,signal:result.signal,error:result.error?.code}));process.exit(result.status??1);
