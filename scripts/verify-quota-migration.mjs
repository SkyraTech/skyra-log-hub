import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,testEnvironment,readState,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';import {verifyQuotaMigration} from './lib/quota-migration-integrity.mjs';
const env=testEnvironment(readState()),c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),physical=await isolatedAdminClient(readState());await physical.end();
try{
  await verifyQuotaMigration(c);await c.query('BEGIN');
  try{await c.query('ALTER TABLE project_usage_windows DROP CONSTRAINT usage_bounds');await assert.rejects(verifyQuotaMigration(c),/constraint drift/);}finally{await c.query('ROLLBACK');}
  await verifyQuotaMigration(c);
  assert.equal((await c.query("SELECT has_function_privilege('public','public.lock_active_quota_project(uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
  const result={ledgerAndCatalogVerified:true,driftDetected:true,driftRolledBack:true,lockFunctionPublicExecution:false};fs.writeFileSync(path.join(root,'.tmp/feature008-evidence/migration-integrity.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await c.end();}
