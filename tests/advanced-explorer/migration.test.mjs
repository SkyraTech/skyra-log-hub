const dev015EvidenceLabel=['dev016','dev017','dev018'].includes(process.env.SKYRA_SDK_EVIDENCE_LABEL)?process.env.SKYRA_SDK_EVIDENCE_LABEL:'dev015';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {root,readState,testEnvironment} from '../../scripts/isolated-postgres.mjs';import {connectIsolatedClient} from '../../scripts/lib/isolated-target.mjs';import {verifyIntegratedMigrations} from '../../scripts/lib/integrated-migration-integrity.mjs';import {verifySavedSearchIntegrity} from '../../scripts/lib/saved-search-integrity.mjs';
test('DEV015 saved-search migration drift and least privilege',async t=>{
 const env=testEnvironment(readState()),c=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),checks=[];
 const scenario=async(name,fn)=>{await t.test(name,async()=>{await fn();checks.push(name);});};
 try{
 await scenario('All current unique migration artifacts and saved-search structure match the deployed catalog',async()=>{assert.equal((await verifyIntegratedMigrations(c)).length,(await verifyIntegratedMigrations(c)).some(r=>r.migration_name==='20261116010000_dev016_dashboard_preferences')?13:12);assert.deepEqual(await verifySavedSearchIntegrity(c),{constraints:9,indexes:4,columns:11,restrictedGrants:true});});
 await scenario('Constraint removal is detected and transactionally rolled back',async()=>{await c.query('BEGIN');try{await c.query('ALTER TABLE saved_searches DROP CONSTRAINT saved_searches_version_check');await assert.rejects(verifySavedSearchIntegrity(c),/constraint drift/);}finally{await c.query('ROLLBACK');}await verifySavedSearchIntegrity(c);});
 await scenario('Shared-list index removal is detected and transactionally rolled back',async()=>{await c.query('BEGIN');try{await c.query('DROP INDEX saved_searches_shared_list_idx');await assert.rejects(verifySavedSearchIntegrity(c));}finally{await c.query('ROLLBACK');}await verifySavedSearchIntegrity(c);});
 await scenario('Forbidden BFF table grant is detected and transactionally rolled back',async()=>{await c.query('BEGIN');try{await c.query('GRANT SELECT ON saved_searches TO skyra_bff_sessions_runtime');await assert.rejects(verifySavedSearchIntegrity(c),/grant drift/);}finally{await c.query('ROLLBACK');}await verifySavedSearchIntegrity(c);});
 await scenario('New migration checksum tampering is detected and transactionally rolled back',async()=>{await c.query('BEGIN');try{await c.query("UPDATE _prisma_migrations SET checksum='drift-test' WHERE migration_name='20261116000000_dev015_saved_searches'");await assert.rejects(verifyIntegratedMigrations(c));}finally{await c.query('ROLLBACK');}await verifyIntegratedMigrations(c);});
 fs.writeFileSync(path.join(root,'.tmp/'+dev015EvidenceLabel+'-evidence/saved-search-migration.json'),JSON.stringify({checks,constraints:9,indexes:4,columns:11,migrations:(await verifyIntegratedMigrations(c)).length,driftRollbacks:4},null,2));
 }finally{await c.end();}
});
