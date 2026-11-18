import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';
const state=readState(),env=testEnvironment(state),client=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await client.end();const physical=await isolatedAdminClient(state);await physical.end();
const result=spawnSync(process.execPath,['--test','tests/organization/organization.e2e.mjs'],{cwd:root,env:{...env,SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST:'true',SKYRA_MEMBERS_E2E:'true',SKYRA_PROJECTS_E2E:'true',SKYRA_ORGANIZATION_EVIDENCE_LABEL:'feature003'},stdio:'inherit',windowsHide:true,timeout:240000});process.exit(result.status??1);
