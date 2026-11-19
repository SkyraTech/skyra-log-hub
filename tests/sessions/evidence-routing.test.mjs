import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertSessionEvidenceTarget} from './evidence-target.mjs';
import {assertAuthorizedEvidenceDirectory,createUniqueEvidenceDirectory,publishEvidenceFile,verifyCandidateHash} from '../../scripts/lib/evidence-output-policy.mjs';

test('session evidence refuses mismatched or historical DEV-013 targets',()=>{
 const root=process.cwd();
 assert.equal(assertSessionEvidenceTarget(path.join(root,'.tmp/dev018-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev018'}),path.join(root,'.tmp/dev018-evidence/session-admin.log'));
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev018'}),/must match|does not belong/);
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev013'}),/Refusing to write/);
 assert.throws(()=>assertSessionEvidenceTarget(path.join(root,'.tmp/dev013-evidence'),{SKYRA_SESSION_TEST_LABEL:'dev013',SKYRA_ALLOW_HISTORICAL_OVERWRITE:'true'}),/Refusing to write/);
});

test('preservation policy isolates run output and publishes without replacement',()=>{
 const root=process.cwd(),label='run-preservation',historical=['http-security.json','outage-recovery.json','persistence.json','session-admin.log'].map(name=>path.join(root,'.tmp/dev013-evidence',name)),before=historical.map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
 const runId=crypto.randomUUID().replaceAll('-',''),directory=createUniqueEvidenceDirectory({workspaceRoot:root,label,runId});
 try{
  assertAuthorizedEvidenceDirectory(directory,{workspaceRoot:root,label});
  const published=publishEvidenceFile(directory,'sample.json','synthetic',{workspaceRoot:root,label});
  assert.equal(published.incomplete,false);assert.throws(()=>publishEvidenceFile(directory,'sample.json','replacement',{workspaceRoot:root,label}),/Refusing to replace/);
  assert.throws(()=>assertAuthorizedEvidenceDirectory(path.join(root,'outside-evidence'),{workspaceRoot:root,label}),/inside/);
  assert.equal(verifyCandidateHash(published.path,published.sha256).match,true);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 const after=historical.map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));assert.deepEqual(after,before);
});
