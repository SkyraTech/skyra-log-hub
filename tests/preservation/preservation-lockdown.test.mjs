import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertAuthorizedEvidenceDirectory,createUniqueEvidenceDirectory,publishEvidenceFile,verifyCandidateHash} from '../../scripts/lib/evidence-output-policy.mjs';

test('preservation policy rejects missing/ambiguous labels and traversal',()=>{
 const root=process.cwd();
 assert.throws(()=>assertAuthorizedEvidenceDirectory(path.join(root,'.tmp/dev018-evidence'),{}),/Invalid or missing/);
 assert.throws(()=>assertAuthorizedEvidenceDirectory(path.join(root,'.tmp','..','escape-evidence'),{workspaceRoot:root,label:'dev018'}),/inside/);
 assert.throws(()=>createUniqueEvidenceDirectory({workspaceRoot:root,label:'dev018',runId:'short'}),/run identifier/);
});

test('preservation policy creates unique run output and refuses duplicate publication',async()=>{
 const root=process.cwd(),label='run-preservation',directory=createUniqueEvidenceDirectory({workspaceRoot:root,label,runId:crypto.randomUUID().replaceAll('-','')});
 try{
  const first=publishEvidenceFile(directory,'evidence.json','synthetic-fixture',{workspaceRoot:root,label});
  assert.equal(first.incomplete,false);assert.equal(verifyCandidateHash(first.path,first.sha256).match,true);assert.throws(()=>publishEvidenceFile(directory,'evidence.json','replacement',{workspaceRoot:root,label}),/Refusing to replace/);
  const concurrent=await Promise.allSettled([Promise.resolve().then(()=>publishEvidenceFile(directory,'concurrent.json','one',{workspaceRoot:root,label})),Promise.resolve().then(()=>publishEvidenceFile(directory,'concurrent.json','two',{workspaceRoot:root,label}))]);assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);assert.equal(concurrent.filter(result=>result.status==='rejected').length,1);
  assert.equal(fs.readdirSync(directory).some(name=>name.endsWith('.incomplete')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('synthetic candidate mismatch and exact match are distinguished without restoration',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'skyra-preservation-candidate-'));
 try{
  const file=path.join(directory,'candidate.json');fs.writeFileSync(file,'synthetic-original');const expected=crypto.createHash('sha256').update('synthetic-original').digest('hex');const match=verifyCandidateHash(file,expected),mismatch=verifyCandidateHash(file,'0'.repeat(64));assert.equal(match.match,true);assert.equal(mismatch.match,false);assert.equal(fs.readFileSync(file,'utf8'),'synthetic-original');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
