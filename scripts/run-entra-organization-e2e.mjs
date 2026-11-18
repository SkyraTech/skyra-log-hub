import {spawnSync} from 'node:child_process';
import {root,testEnvironment,readState,isolatedAdminClient} from './isolated-postgres.mjs';
import {connectIsolatedClient} from './lib/isolated-target.mjs';
const state=readState(),env=testEnvironment(state);
const target=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await target.end();
const physical=await isolatedAdminClient(state);await physical.end();
const result=spawnSync(process.execPath,['--test','tests/organization/organization.e2e.mjs'],{cwd:root,env:{...env,SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true'},stdio:'inherit',windowsHide:true,timeout:180000});
process.exit(result.status??1);
