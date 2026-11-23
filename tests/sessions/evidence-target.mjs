import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertAuthorizedEvidenceDirectory,createUniqueEvidenceDirectory} from '../../scripts/lib/evidence-output-policy.mjs';

let generatedSessionEvidence;

export function sessionEvidenceDirectory(root, environment=process.env){
 const label=environment.SKYRA_SESSION_TEST_LABEL;
 if(environment.SKYRA_SESSION_EVIDENCE_DIR)return assertAuthorizedEvidenceDirectory(environment.SKYRA_SESSION_EVIDENCE_DIR,{workspaceRoot:root,label});
 if(!label)throw Error('SKYRA_SESSION_TEST_LABEL is required for session evidence');
 if(generatedSessionEvidence)return generatedSessionEvidence;
 generatedSessionEvidence=createUniqueEvidenceDirectory({workspaceRoot:root,label,runId:`run-${Date.now()}-${crypto.randomUUID().slice(0,8)}`});
 environment.SKYRA_SESSION_EVIDENCE_DIR=generatedSessionEvidence;
 return generatedSessionEvidence;
}

export function assertSessionEvidenceTarget(evidence, environment=process.env){
 const label=environment.SKYRA_SESSION_TEST_LABEL;
 const resolved=assertAuthorizedEvidenceDirectory(evidence,{label});
 const logPath=path.join(resolved,'session-admin.log');
 if(label==='dev013'&&path.basename(resolved)==='dev013-evidence')throw Error(`Refusing to write historical session evidence: ${logPath}`);
 return logPath;
}
