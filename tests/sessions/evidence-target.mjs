import fs from 'node:fs';
import path from 'node:path';

export function assertSessionEvidenceTarget(evidence, environment=process.env){
 const label=environment.SKYRA_SESSION_TEST_LABEL;
 const expected=label?`${label}-evidence`:null;
 if(!expected||path.basename(path.resolve(evidence))!==expected)throw Error(`Session evidence directory must match SKYRA_SESSION_TEST_LABEL (${expected??'missing label'})`);
 const logPath=path.join(evidence,'session-admin.log');
 if(label==='dev013'&&fs.existsSync(logPath))throw Error(`Refusing to overwrite historical session evidence: ${logPath}`);
 return logPath;
}
