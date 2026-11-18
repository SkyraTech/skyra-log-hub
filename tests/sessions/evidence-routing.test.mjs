import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {assertSessionEvidenceTarget} from './evidence-target.mjs';

test('session evidence refuses mismatched or historical DEV-013 targets',()=>{
 const root=process.cwd();
 assert.equal(assertSessionEvidenceTarget(path.join(root,'.tmp/dev018-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev018'}),path.join(root,'.tmp/dev018-evidence/session-admin.log'));
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev018'}),/must match/);
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev013'}),/Refusing to overwrite/);
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev013',SKYRA_ALLOW_HISTORICAL_OVERWRITE:'true'}),/Refusing to overwrite/);
});
